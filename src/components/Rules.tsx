export default function Rules() {
  return (
    <div className="mt-12 max-w-2xl text-slate-400 text-sm bg-slate-800/50 p-6 rounded-lg border border-slate-700">
      <h3 className="text-slate-200 font-bold mb-2">Rules</h3>
      <p className="mb-2">
        You have three sets of cards. These cards go from 1 to 9. There are also cards that don't have a number called dragons. There is also a special card that has a flower.
      </p>
      <p className="mb-2">
        In normal Solitaire fashion, you are able to move cards onto other cards in the lower decks. The rule is that the cards must be decreasing and consecutive, and two cards of the same deck cannot be placed on each other, it has to be alternating. This means dragons can't be moved onto other cards and neither can the flower.
      </p>
      <p className="mb-2">
        In the top-left hand corner, you can store one card of any kind. It can store up to three cards.
      </p>
      <p className="mb-2">
        When all four dragons are exposed, you can press the corresponding button to move them all to a free space in the top-left hand corner. If one deck of dragons is completed, that space is upusable.
      </p>
      <p className="mb-2">
        The one space in the middle is where the flower card goes.
      </p>
      <p className="mb-2">
        To win the game, you must stack cards of the same deck in the top-right hand corner from 1 to 9 (bottom to top). Cards stacked on the top-right corner can't be moved.
      </p>
    </div>
  )
}
