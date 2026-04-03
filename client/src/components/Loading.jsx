export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0f172a]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-slate-700 border-t-violet-500 animate-spin" />
        <p className="text-sm text-slate-400">読み込み中...</p>
      </div>
    </div>
  )
}
