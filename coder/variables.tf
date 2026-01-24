variable "base_image" {
  description = "Base Docker image for the workspace"
  type        = string
  default     = "node:current"
}

variable "repo_url" {
  description = "Git SSH URL for the repository"
  type        = string
  default     = "git@gitea-ssh.gaeljacquin.com:gaeljacquin/shenzhen-solitaire.git"
}

variable "dev_branch" {
  description = "Git branch to clone for the repository"
  type        = string
  default     = "dev"
}

variable "port" {
  description = "Port for the app"
  type        = number
  default     = 3000
}

variable "code_server_port" {
  description = "Port for code-server"
  type        = number
  default     = 8080
}

variable "app_dir" {
  description = "Name of directory for app"
  type        = string
  default     = "shenzhen-solitaire"
}
