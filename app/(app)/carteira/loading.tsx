export default function CarteiraLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-24">
      <div className="skeleton h-8 w-40 rounded-lg" aria-hidden="true" />
      <div className="skeleton h-32 rounded-xl" aria-hidden="true" />
      <div className="skeleton h-48 rounded-xl" aria-hidden="true" />
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-lg" aria-hidden="true" />
        ))}
      </div>
    </div>
  )
}
