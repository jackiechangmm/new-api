/*
Copyright (C) 2023-2026 QuantumNous

This file includes adapted work from inpaint-web:
https://github.com/lxfater/inpaint-web
Copyright (C) lxfater and contributors, licensed under GPL-3.0.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import { Download, Undo2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'

import { validateImageFile, type ImageValidationError } from './image-validation'

type Point = { x: number; y: number }

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('image-export-failed'))
    }, 'image/png')
  })
}

async function drawBlob(canvas: HTMLCanvasElement, blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  bitmap.close()
}

export function WatermarkRemoval() {
  const { t } = useTranslation()
  const imageCanvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const brushPreviewRef = useRef<HTMLDivElement>(null)
  const lastPointRef = useRef<Point | undefined>(undefined)
  const [file, setFile] = useState<File>()
  const [brushSize, setBrushSize] = useState(40)
  const [history, setHistory] = useState<Blob[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hasResult, setHasResult] = useState(false)
  const [showBrush, setShowBrush] = useState(false)

  const validationMessage = (error: ImageValidationError) => {
    if (error === 'format') return t('Use a PNG, JPEG, or WebP image.')
    if (error === 'size') return t('The image must be 25 MB or smaller.')
    return t('The image dimensions must not exceed 4096 x 4096 pixels.')
  }

  const openImage = async (selected: File) => {
    const fileError = validateImageFile(selected)
    if (fileError) {
      toast.error(validationMessage(fileError))
      return
    }

    try {
      const bitmap = await createImageBitmap(selected)
      const dimensionError = validateImageFile(selected, bitmap)
      if (dimensionError) {
        bitmap.close()
        toast.error(validationMessage(dimensionError))
        return
      }

      const imageCanvas = imageCanvasRef.current
      const maskCanvas = maskCanvasRef.current
      if (!imageCanvas || !maskCanvas) return
      imageCanvas.width = bitmap.width
      imageCanvas.height = bitmap.height
      maskCanvas.width = bitmap.width
      maskCanvas.height = bitmap.height
      imageCanvas.getContext('2d')?.drawImage(bitmap, 0, 0)
      maskCanvas.getContext('2d')?.clearRect(0, 0, bitmap.width, bitmap.height)
      bitmap.close()
      setFile(selected)
      setHistory([])
      setHasResult(false)
    } catch {
      toast.error(t('The image could not be opened.'))
    }
  }

  const processStroke = async () => {
    const imageCanvas = imageCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!imageCanvas || !maskCanvas || processing) return

    setProcessing(true)
    setProgress(0)
    try {
      const context = imageCanvas.getContext('2d', { willReadFrequently: true })
      const maskContext = maskCanvas.getContext('2d', {
        willReadFrequently: true,
      })
      if (!context || !maskContext) throw new Error('canvas-unavailable')

      const image = context.getImageData(
        0,
        0,
        imageCanvas.width,
        imageCanvas.height
      )
      const painted = maskContext.getImageData(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height
      ).data
      const mask = new Uint8Array(imageCanvas.width * imageCanvas.height)
      mask.fill(255)
      for (let pixel = 0; pixel < mask.length; pixel += 1) {
        if (painted[pixel * 4 + 3] > 0) mask[pixel] = 0
      }

      const previous = await canvasToBlob(imageCanvas)
      const { removeWatermark } = await import('./inpaint')
      const result = await removeWatermark(image, mask, setProgress)
      await drawBlob(imageCanvas, result)
      maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
      setHistory((current) => [...current, previous])
      setHasResult(true)
    } catch (error) {
      const unsupported =
        error instanceof Error && error.message === 'browser-unsupported'
      toast.error(
        unsupported
          ? t('This browser does not support WebGPU or WebAssembly.')
          : t('Watermark removal failed.'),
        unsupported
          ? undefined
          : {
              action: {
                label: t('Retry'),
                onClick: processStroke,
              },
            }
      )
    } finally {
      setProcessing(false)
    }
  }

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const bounds = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    }
  }

  const moveBrushPreview = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const preview = brushPreviewRef.current
    if (!preview) return
    const bounds = event.currentTarget.getBoundingClientRect()
    preview.style.transform = `translate3d(${event.clientX - bounds.left - brushSize / 2}px, ${event.clientY - bounds.top - brushSize / 2}px, 0)`
  }

  const drawStroke = (
    event: React.PointerEvent<HTMLCanvasElement>,
    start: Point
  ) => {
    const canvas = event.currentTarget
    const bounds = canvas.getBoundingClientRect()
    const point = canvasPoint(event)
    const context = canvas.getContext('2d')
    if (!context) return
    context.strokeStyle = 'rgba(239, 68, 68, 0.55)'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = brushSize * (canvas.width / bounds.width)
    context.beginPath()
    if (start.x === point.x && start.y === point.y) {
      context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2)
      context.fillStyle = context.strokeStyle
      context.fill()
    } else {
      context.moveTo(start.x, start.y)
      context.lineTo(point.x, point.y)
      context.stroke()
    }
    lastPointRef.current = point
  }

  const undo = async () => {
    const previous = history.at(-1)
    const imageCanvas = imageCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!previous || !imageCanvas || !maskCanvas) return
    await drawBlob(imageCanvas, previous)
    maskCanvas.getContext('2d')?.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    const nextHistory = history.slice(0, -1)
    setHistory(nextHistory)
    setHasResult(nextHistory.length > 0)
  }

  const startNew = () => {
    setFile(undefined)
    setHistory([])
    setHasResult(false)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const download = async () => {
    const canvas = imageCanvasRef.current
    if (!canvas || !file) return
    const blob = await canvasToBlob(canvas)
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${file.name.replace(/\.[^.]+$/, '')}-watermark-removed.png`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
  }

  return (
    <Main className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 pt-3 pb-3 sm:px-4 sm:pt-5 sm:pb-4'>
      <header className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <h1 className='truncate text-xl font-semibold'>{t('Remove Watermark')}</h1>
          <p className='text-muted-foreground text-sm'>
            {t('Paint over a watermark to remove it locally in your browser.')}
          </p>
        </div>
      </header>

      <input
        ref={fileInputRef}
        className='sr-only'
        type='file'
        accept='image/png,image/jpeg,image/webp'
        onChange={(event) => {
          const selected = event.target.files?.[0]
          if (selected) void openImage(selected)
        }}
      />

      <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30'>
        {!file && (
          <button
            type='button'
            className='border-border hover:bg-muted/60 focus-visible:ring-ring flex h-full min-h-72 w-full flex-col items-center justify-center gap-3 border border-dashed p-6 text-center outline-none focus-visible:ring-3'
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const selected = event.dataTransfer.files[0]
              if (selected) void openImage(selected)
            }}
          >
            <Upload className='text-muted-foreground size-8' aria-hidden='true' />
            <span className='font-medium'>{t('Choose or drop an image')}</span>
            <span className='text-muted-foreground text-sm'>
              {t('PNG, JPEG, or WebP up to 25 MB and 4096 x 4096 pixels')}
            </span>
          </button>
        )}

        <div
          className={file ? 'relative max-h-full max-w-full' : 'hidden'}
          style={
            imageCanvasRef.current
              ? {
                  aspectRatio: `${imageCanvasRef.current.width} / ${imageCanvasRef.current.height}`,
                }
              : undefined
          }
        >
          <canvas
            ref={imageCanvasRef}
            className='block max-h-[calc(100vh-15rem)] max-w-full bg-black object-contain'
          />
          <canvas
            ref={maskCanvasRef}
            aria-label={t('Watermark painting area')}
            className='absolute inset-0 size-full cursor-none touch-none'
            onPointerEnter={(event) => {
              moveBrushPreview(event)
              setShowBrush(true)
            }}
            onPointerLeave={() => setShowBrush(false)}
            onPointerDown={(event) => {
              if (processing) return
              event.currentTarget.setPointerCapture(event.pointerId)
              const point = canvasPoint(event)
              lastPointRef.current = point
              drawStroke(event, point)
            }}
            onPointerMove={(event) => {
              moveBrushPreview(event)
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
              const previous = lastPointRef.current
              if (previous) drawStroke(event, previous)
            }}
            onPointerUp={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
              event.currentTarget.releasePointerCapture(event.pointerId)
              lastPointRef.current = undefined
              void processStroke()
            }}
          />
          <div
            ref={brushPreviewRef}
            className={`pointer-events-none absolute top-0 left-0 rounded-full border border-white/80 bg-red-500/35 shadow-sm ${showBrush && !processing ? '' : 'hidden'}`}
            style={{
              width: brushSize,
              height: brushSize,
            }}
            aria-hidden='true'
          />
          {processing && (
            <div className='bg-background/85 absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 backdrop-blur-sm'>
              <span className='text-sm font-medium'>
                {progress < 100
                  ? t('Downloading model... {{progress}}%', { progress })
                  : t('Removing watermark...')}
              </span>
              <Progress className='w-full max-w-72' value={progress} />
            </div>
          )}
        </div>
      </div>

      {file && (
        <div className='border-border flex shrink-0 flex-wrap items-center gap-2 border-t pt-3'>
          <Button variant='outline' onClick={startNew} disabled={processing}>
            <X aria-hidden='true' />
            {t('Start new')}
          </Button>
          <label className='flex w-64 shrink-0 items-center gap-3 px-2 text-sm'>
            <span className='shrink-0'>{t('Brush size')}</span>
            <Slider
              aria-label={t('Brush size')}
              min={10}
              max={200}
              value={[brushSize]}
              onValueChange={(value) =>
                setBrushSize(Array.isArray(value) ? value[0] : value)
              }
              disabled={processing}
            />
          </label>
          <Button
            variant='outline'
            onClick={() => void undo()}
            disabled={processing || history.length === 0}
          >
            <Undo2 aria-hidden='true' />
            {t('Undo')}
          </Button>
          <Button onClick={() => void download()} disabled={processing || !hasResult}>
            <Download aria-hidden='true' />
            {t('Download')}
          </Button>
        </div>
      )}

      <footer className='text-muted-foreground shrink-0 text-center text-xs'>
        {t('Based on')}{' '}
        <a
          className='underline underline-offset-2'
          href='https://github.com/lxfater/inpaint-web'
          target='_blank'
          rel='noreferrer'
        >
          inpaint-web
        </a>{' '}
        ·{' '}
        <a
          className='underline underline-offset-2'
          href='https://github.com/lxfater/inpaint-web/blob/main/LICENSE'
          target='_blank'
          rel='noreferrer'
        >
          GPL-3.0
        </a>
      </footer>
    </Main>
  )
}
