terraform {
  required_providers {
    coder = {
      source  = "coder/coder"
      version = "~> 0.20"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "coder" {}
provider "docker" {}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

resource "docker_volume" "home" {
  name = "coder-${data.coder_workspace_owner.me.name}-${data.coder_workspace.me.name}-home"
}

resource "docker_image" "dev" {
  name         = var.base_image
  keep_locally = true
}

resource "coder_agent" "main" {
  os   = "linux"
  arch = "amd64"

  # IMPORTANT: do NOT set GIT_SSH_COMMAND here, Coder uses it to inject your SSH key.
  env = {
    HOME = "/root"
  }

  startup_script = <<-EOT
    exec >"$HOME/startup.log" 2>&1
    set -eu

    echo "Startup begin: $(date -Iseconds)"
    # Ensure base tools exist
    if ! command -v git >/dev/null 2>&1; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y --no-install-recommends git openssh-client ca-certificates curl
      update-ca-certificates || true
    fi

    # Preserve Coder's injected GIT_SSH_COMMAND (contains IdentityFile),
    # but auto-accept host keys on first connect.
    if [ -n "$${GIT_SSH_COMMAND:-}" ]; then
      export GIT_SSH_COMMAND="$${GIT_SSH_COMMAND} -o StrictHostKeyChecking=accept-new"
    else
      export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"
    fi

    # Clone or fix remote
    if [ -d "$HOME/${var.app_dir}/.git" ]; then
      git -C "$HOME/${var.app_dir}" remote set-url origin "${var.repo_url}" || true
      git -C "$HOME/${var.app_dir}" fetch origin "${var.dev_branch}" || true
      git -C "$HOME/${var.app_dir}" checkout "${var.dev_branch}" || true
      git -C "$HOME/${var.app_dir}" pull --ff-only origin "${var.dev_branch}" || true
    else
      rm -rf "$HOME/${var.app_dir}"
      git clone -b "${var.dev_branch}" "${var.repo_url}" "$HOME/${var.app_dir}"
    fi

    cd "$HOME/${var.app_dir}"

    # Corepack/pnpm without global installs (avoids yarnpkg EEXIST issues)
    npx -y corepack@latest enable
    npx -y corepack@latest prepare pnpm@latest --activate

    # Install deps using corepack pnpm (avoid PATH/shim timing issues)
    npx -y corepack@latest pnpm install

    (
      nohup npx -y corepack@latest pnpm exec vite dev --host 0.0.0.0 --port ${var.port} >"$HOME/app.log" 2>&1 &
    )

    # Install and start code-server for browser-based VS Code
    if ! command -v curl >/dev/null 2>&1; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y --no-install-recommends curl ca-certificates
      update-ca-certificates || true
    fi
    if ! command -v code-server >/dev/null 2>&1; then
      curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --prefix=/usr/local
    fi
    (
      nohup code-server --bind-addr 0.0.0.0:${var.code_server_port} --auth none "$HOME/${var.app_dir}" >"$HOME/code-server.log" 2>&1 &
    )

    echo "Started app on :${var.port} (log: $HOME/app.log)"
    echo "Started code-server on :${var.code_server_port} (log: $HOME/code-server.log)"
    echo "Startup end: $(date -Iseconds)"
  EOT
}

resource "docker_container" "workspace" {
  image = docker_image.dev.image_id
  name  = "coder-${data.coder_workspace_owner.me.name}-${data.coder_workspace.me.name}"

  env = [
    "CODER_AGENT_TOKEN=${coder_agent.main.token}",
    "HOME=/root",
  ]

  entrypoint = ["/bin/sh", "-c", <<-EOT
    set -eu
    if ! command -v curl >/dev/null 2>&1; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y --no-install-recommends curl ca-certificates tar gzip
      update-ca-certificates || true
    fi
    ${coder_agent.main.init_script}
  EOT
  ]
  hostname     = data.coder_workspace.me.name
  user         = "root"
  working_dir  = "/root"

  volumes {
    container_path = "/root"
    volume_name    = docker_volume.home.name
  }
}

resource "coder_app" "app" {
  agent_id     = coder_agent.main.id
  slug         = "app"
  display_name = "app"
  url          = "http://localhost:${var.port}"
  subdomain    = true

  healthcheck {
    url       = "http://localhost:${var.port}"
    interval  = 5
    threshold = 20
  }
}

resource "coder_app" "vscode" {
  agent_id     = coder_agent.main.id
  slug         = "vscode"
  display_name = "VS Code"
  url          = "http://localhost:${var.code_server_port}"
  subdomain    = true

  healthcheck {
    url       = "http://localhost:${var.code_server_port}/healthz"
    interval  = 5
    threshold = 20
  }
}
