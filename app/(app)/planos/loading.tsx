export default function PlanosLoading() {
  return (
    <div className="flex flex-col gap-6 px-4 pt-4 pb-24">
      <div className="skeleton h-8 w-48 rounded-lg" aria-hidden="true" />
      <div className="skeleton h-10 w-40 mx-auto rounded-full" aria-hidden="true" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-80 rounded-xl" aria-hidden="true" />
        ))}
      </div>
    </div>
  )
}
