export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-24">
      <div className="skeleton h-8 w-36 rounded-lg" aria-hidden="true" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-24 rounded-xl" aria-hidden="true" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-xl" aria-hidden="true" />
    </div>
  )
}
