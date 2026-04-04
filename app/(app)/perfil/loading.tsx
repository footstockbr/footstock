export default function PerfilLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-24">
      <div className="flex items-center gap-4">
        <div className="skeleton h-16 w-16 rounded-full" aria-hidden="true" />
        <div className="flex flex-col gap-2">
          <div className="skeleton h-5 w-32 rounded" aria-hidden="true" />
          <div className="skeleton h-4 w-24 rounded" aria-hidden="true" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-14 rounded-lg" aria-hidden="true" />
        ))}
      </div>
    </div>
  )
}
