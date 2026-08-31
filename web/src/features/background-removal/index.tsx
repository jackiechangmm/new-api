/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option)
any later version.
*/
import { Download, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  validateImageFile,
  type ImageValidationError,
} from '@/features/watermark-removal/image-validation'

import { removeImageBackground } from './remove-background'

type RemovalResult = Awaited<ReturnType<typeof removeImageBackground>>

export function BackgroundRemoval() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sourceUrlRef = useRef<string | undefined>(undefined)
  const resultRef = useRef<RemovalResult | undefined>(undefined)
  const [file, setFile] = useState<File>()
  const [sourceUrl, setSourceUrl] = useState<string>()
  const [result, setResult] = useState<RemovalResult>()
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(
    () => () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      if (resultRef.current) {
        URL.revokeObjectURL(resultRef.current.blobUrl)
        URL.revokeObjectURL(resultRef.current.previewUrl)
      }
    },
    []
  )

  const validationMessage = (error: ImageValidationError) => {
    if (error === 'format') return t('Use a PNG, JPEG, or WebP image.')
    if (error === 'size') return t('The image must be 25 MB or smaller.')
    return t('Image width and height must each be 4096 pixels or less.')
  }

  const processImage = async (url: string) => {
    setProcessing(true)
    setProgress(0)
    try {
      const nextResult = await removeImageBackground(url, setProgress)
      resultRef.current = nextResult
      setResult(nextResult)
      setProgress(100)
    } catch (error) {
      const unsupported =
        error instanceof Error && error.message === 'browser-unsupported'
      toast.error(
        unsupported
          ? t('This browser does not support WebGPU or WebAssembly.')
          : t('Background removal failed.'),
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
      setProcessing(false)
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
        URL.revokeObjectURL(resultRef.current.previewUrl)
        resultRef.current = undefined
      }
      const nextSourceUrl = URL.createObjectURL(selected)
      sourceUrlRef.current = nextSourceUrl
      setFile(selected)
      setSourceUrl(nextSourceUrl)
      setResult(undefined)
      void processImage(nextSourceUrl)
    } catch {
      toast.error(t('The image could not be opened.'))
    }
  }

  const startNew = () => {
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = undefined
    }
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.blobUrl)
      URL.revokeObjectURL(resultRef.current.previewUrl)
      resultRef.current = undefined
    }
    setFile(undefined)
    setSourceUrl(undefined)
    setResult(undefined)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const download = () => {
    if (!file || !result) return
    const link = document.createElement('a')
    link.href = result.blobUrl
    link.download = `${file.name.replace(/\.[^.]+$/, '')}-background-removed.png`
    link.click()
  }

  return (
    <Main className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 pt-3 pb-3 sm:px-4 sm:pt-5 sm:pb-4'>
      <header className='min-w-0'>
        <h1 className='truncate text-xl font-semibold'>
          {t('Remove Background')}
        </h1>
        <p className='text-muted-foreground text-sm'>
          {t('Remove an image background locally in your browser.')}
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
                'PNG, JPEG, or WebP up to 25 MB; width and height each up to 4096 pixels'
              )}
            </span>
          </button>
        )}

        {file && sourceUrl && (
          <div className='relative flex size-full min-h-0 items-center justify-center'>
            <img
              className='transparency-grid max-h-full max-w-full object-contain'
              src={result?.blobUrl ?? sourceUrl}
              width={result?.width}
              height={result?.height}
              alt={
                result
                  ? t('Image with background removed')
                  : t('Selected image')
              }
            />
            {processing && (
              <div className='bg-background/85 absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 backdrop-blur-sm'>
                <span className='text-sm font-medium'>
                  {progress < 100
                    ? t('Loading model... {{progress}}%', {
                        progress: Math.round(progress),
                      })
                    : t('Removing background...')}
                </span>
                <Progress className='w-full max-w-72' value={progress} />
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

      <p className='text-muted-foreground/20 shrink-0 text-center text-xs'>
        <a
          className='underline-offset-4 hover:underline'
          href='https://www.rembg.com'
          target='_blank'
          rel='noreferrer'
        >
          {t('Background Removal Library provided by www.rembg.com')}
        </a>
      </p>
    </Main>
  )
}
