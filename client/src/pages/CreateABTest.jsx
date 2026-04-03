import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { PageHeader, Card, Button, Input } from '../components/UI'
import { Upload, Image, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

function DropZone({ label, file, onFile }) {
  const inputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0])
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragActive
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-slate-600 hover:border-slate-500'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        className="hidden"
      />
      {file ? (
        <div>
          <img
            src={URL.createObjectURL(file)}
            alt={label}
            className="mx-auto mb-2 max-h-32 rounded-lg object-contain"
          />
          <p className="text-xs text-slate-400">{file.name}</p>
        </div>
      ) : (
        <div>
          <Upload size={32} className="mx-auto mb-2 text-slate-500" />
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-xs text-slate-600">ドラッグ&ドロップまたはクリック</p>
        </div>
      )}
    </div>
  )
}

export default function CreateABTest() {
  const navigate = useNavigate()
  const [nameA, setNameA] = useState('')
  const [nameB, setNameB] = useState('')
  const [urlA, setUrlA] = useState('')
  const [urlB, setUrlB] = useState('')
  const [fileA, setFileA] = useState(null)
  const [fileB, setFileB] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!fileA || !fileB) {
      toast.error('両方の画像をアップロードしてください')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('nameA', nameA)
      formData.append('nameB', nameB)
      formData.append('urlA', urlA)
      formData.append('urlB', urlB)
      formData.append('imageA', fileA)
      formData.append('imageB', fileB)

      await api.post('/api/abtest/create-ab-test', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('テストを作成しました')
      navigate('/dashboard/ab-tests')
    } catch {
      toast.error('作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="新規A/Bテスト" subtitle="2つのバリアントを比較するテストを作成">
        <Button variant="ghost" onClick={() => navigate('/dashboard/ab-tests')}>
          <ArrowLeft size={16} /> 戻る
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Variant A */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-violet-400">バリアント A</h3>
          <div className="space-y-4">
            <Input label="名前" value={nameA} onChange={(e) => setNameA(e.target.value)} placeholder="バリアントA名" />
            <Input label="ターゲットURL" value={urlA} onChange={(e) => setUrlA(e.target.value)} placeholder="https://..." />
            <DropZone label="画像Aをアップロード" file={fileA} onFile={setFileA} />
          </div>
        </Card>

        {/* Variant B */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-blue-400">バリアント B</h3>
          <div className="space-y-4">
            <Input label="名前" value={nameB} onChange={(e) => setNameB(e.target.value)} placeholder="バリアントB名" />
            <Input label="ターゲットURL" value={urlB} onChange={(e) => setUrlB(e.target.value)} placeholder="https://..." />
            <DropZone label="画像Bをアップロード" file={fileB} onFile={setFileB} />
          </div>
        </Card>
      </div>

      <Button onClick={handleSubmit} disabled={loading} className="w-full md:w-auto">
        {loading ? '作成中...' : 'テストを作成'}
      </Button>
    </div>
  )
}
