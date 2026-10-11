'use client'

import { useId, useRef, useState } from 'react'

export type ProofImage = { src: string; title: string; caption: string }

export default function ProofGallery({ images }: { images: ProofImage[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [selected, setSelected] = useState(0)
  const current = images[selected]
  return (
    <>
      <div className="home-proof-grid">
        {images.map((image, index) => (
          <button key={image.src} type="button" className="home-proof-card" onClick={() => { setSelected(index); dialog.current?.showModal() }} aria-label={`Enlarge ${image.title}`}>
            <div className="home-proof-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt={image.title} loading="lazy" />
              <span className="home-proof-zoom" aria-hidden="true">↗</span>
            </div>
            <span className="block p-5 text-left"><strong className="block text-sm text-white">{image.title}</strong><span className="mt-2 block text-xs leading-5 text-slate-400">{image.caption}</span></span>
          </button>
        ))}
      </div>
      <dialog ref={dialog} className="home-lightbox" aria-labelledby={titleId} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}>
        <div className="home-lightbox-inner">
          <div className="flex items-center justify-between gap-4 p-4 sm:px-6">
            <div><p className="text-xs text-slate-400">Project evidence · {selected + 1} / {images.length}</p><h2 id={titleId} className="mt-1 text-sm font-semibold">{current.title}</h2></div>
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className="home-lightbox-control" aria-label="Close screenshot">✕</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.src} alt={current.title} className="home-lightbox-image" />
          <div className="flex items-center justify-between gap-4 p-4 sm:px-6">
            <p className="max-w-3xl text-xs leading-5 text-slate-300">{current.caption}</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="home-lightbox-control" aria-label="Previous screenshot" onClick={() => setSelected((selected + images.length - 1) % images.length)}>←</button>
              <button type="button" className="home-lightbox-control" aria-label="Next screenshot" onClick={() => setSelected((selected + 1) % images.length)}>→</button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  )
}
