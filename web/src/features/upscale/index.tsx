/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import { Download, Eye, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

import {
  validateImageFile,
  type ImageValidationError,
} from './image-validation'
import { upscaleImage, type UpscaleProgress } from './super-resolution'

type UpscaleResult = Awaited<ReturnType<typeof upscaleImage>>

export function Upscale() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | undefined>(undefined)
  const sourceUrlRef = useRef<string | undefined>(undefined)
  const resultRef = useRef<UpscaleResult | undefined>(undefined)
  const [file, setFile] = useState<File>()
  const [sourceUrl, setSourceUrl] = useState<string>()
  const [result, setResult] = useState<UpscaleResult>()
  const [processing, setProcessing] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [progress, setProgress] = useState<UpscaleProgress>({
    phase: 'loading-model',
    progress: 0,
  })

  useEffect(
    () => () => {
      abortControllerRef.current?.abort()
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      if (resultRef.current) {
        URL.revokeObjectURL(resultRef.current.blobUrl)
      }
    },
    []
  )

  const validationMessage = (error: ImageValidationError) => {
    if (error === 'format') return t('Use a PNG, JPEG, or WebP image.')
    if (error === 'size') return t('The image must be 25 MB or smaller.')
    return t('The image long edge must not exceed 1024 pixels.')
  }

  const processImage = async (url: string) => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setProcessing(true)
    setProgress({ phase: 'loading-model', progress: 0 })
    try {
      const nextResult = await upscaleImage(url, setProgress, controller.signal)
      if (controller.signal.aborted) return
      resultRef.current = nextResult
      setResult(nextResult)
      setComparing(false)
      setProgress({ phase: 'upscaling', progress: 100 })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const unsupported =
        error instanceof Error && error.message === 'browser-unsupported'
      toast.error(
        unsupported
          ? t('This browser does not support WebGPU or WebAssembly.')
          : t('Upscaling failed.'),
        unsupported
          ? undefined
          : {
              action: {
                label: t('Retry'),
                onClick: () => void processImage(url),
              },
            }
      )
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = undefined
        setProcessing(false)
      }
    }
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
      bitmap.close()
      if (dimensionError) {
        toast.error(validationMessage(dimensionError))
        return
      }

      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      if (resultRef.current) {
        URL.revokeObjectURL(resultRef.current.blobUrl)
        resultRef.current = undefined
      }
      const nextSourceUrl = URL.createObjectURL(selected)
      sourceUrlRef.current = nextSourceUrl
      setFile(selected)
      setSourceUrl(nextSourceUrl)
      setResult(undefined)
      setComparing(false)
      void processImage(nextSourceUrl)
    } catch {
      toast.error(t('The image could not be opened.'))
    }
  }

  const startNew = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = undefined
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = undefined
    }
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.blobUrl)
      resultRef.current = undefined
    }
    setFile(undefined)
    setSourceUrl(undefined)
    setResult(undefined)
    setComparing(false)
    setProgress({ phase: 'loading-model', progress: 0 })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const download = () => {
    if (!file || !result) return
    const link = document.createElement('a')
    link.href = result.blobUrl
    link.download = `${file.name.replace(/\.[^.]+$/, '')}-upscaled-4x.png`
    link.click()
  }

  return (
    <Main className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 pt-3 pb-3 sm:px-4 sm:pt-5 sm:pb-4'>
      <header className='min-w-0'>
        <h1 className='truncate text-xl font-semibold'>{t('Upscale Image')}</h1>
        <p className='text-muted-foreground text-sm'>
          {t('Upscale an image 4x locally in your browser using AI.')}
        </p>
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

      <div className='bg-muted/30 relative flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
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
            <Upload
              className='text-muted-foreground size-8'
              aria-hidden='true'
            />
            <span className='font-medium'>{t('Choose or drop an image')}</span>
            <span className='text-muted-foreground text-sm'>
              {t(
                'PNG, JPEG, or WebP up to 25 MB with a maximum long edge of 1024 pixels'
              )}
            </span>
          </button>
        )}

        {file && sourceUrl && (
          <div className='relative flex size-full min-h-0 items-center justify-center'>
            <img
              className='max-h-full max-w-full object-contain'
              src={result?.blobUrl ?? sourceUrl}
              width={result?.width}
              height={result?.height}
              alt={result ? t('Upscaled image') : t('Selected image')}
            />
            {result && comparing && (
              <img
                className='absolute inset-0 size-full object-contain'
                src={sourceUrl}
                alt={t('Original image')}
              />
            )}
            {result && (
              <>
                <span
                  key={result.blobUrl}
                  className='history-sweep'
                  aria-hidden='true'
                />
                <Button
                  className='absolute top-3 right-3 z-20 shadow-sm'
                  size='sm'
                  variant='secondary'
                  onMouseEnter={() => setComparing(true)}
                  onMouseLeave={() => setComparing(false)}
                  onFocus={() => setComparing(true)}
                  onBlur={() => setComparing(false)}
                >
                  <Eye aria-hidden='true' />
                  {t('Compare')}
                </Button>
              </>
            )}
            {processing && (
              <div className='bg-background/85 absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 backdrop-blur-sm'>
                <span className='text-sm font-medium'>
                  {progress.phase === 'loading-model'
                    ? t('Loading model... {{progress}}%', {
                        progress: Math.round(progress.progress),
                      })
                    : t('Upscaling image... {{progress}}%', {
                        progress: Math.round(progress.progress),
                      })}
                </span>
                <Progress
                  className='w-full max-w-72'
                  value={progress.progress}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {file && (
        <div className='flex shrink-0 flex-wrap items-center justify-center gap-2'>
          <Button variant='outline' onClick={startNew} disabled={processing}>
            <X aria-hidden='true' />
            {t('Start new')}
          </Button>
          <Button onClick={download} disabled={processing || !result}>
            <Download aria-hidden='true' />
            {t('Download')}
          </Button>
        </div>
      )}

    </Main>
  )
}
