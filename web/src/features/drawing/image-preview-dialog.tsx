import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

export type ImagePreviewSource = Blob | string

function useBlobUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [blob])
  return url
}

export function ImagePreviewDialog(props: {
  images: ImagePreviewSource[]
  initialIndex: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(props.initialIndex)
  const current = props.images[index]
  const objectUrl = useBlobUrl(
    typeof current === 'string' ? undefined : current
  )
  const url = typeof current === 'string' ? current : objectUrl
  const hasMultiple = props.images.length > 1

  useEffect(() => {
    setIndex(props.initialIndex)
  }, [props.initialIndex])

  useEffect(() => {
    if (!hasMultiple) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setIndex(
          (value) => (value - 1 + props.images.length) % props.images.length
        )
      } else if (event.key === 'ArrowRight') {
        setIndex((value) => (value + 1) % props.images.length)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasMultiple, props.images.length])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent
        className='w-fit max-w-[calc(100vw-2rem)] bg-black/90 p-2 sm:max-w-[calc(100vw-2rem)]'
        showCloseButton
      >
        <div className='group relative flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] items-center justify-center'>
          {url ? (
            <img
              alt={t('Image preview')}
              className='h-auto max-h-[calc(100vh-2rem)] w-auto max-w-[calc(100vw-2rem)] object-contain'
              src={url}
            />
          ) : (
            <Loader2 className='mx-auto size-8 animate-spin text-white' />
          )}
          {hasMultiple ? (
            <>
              <Button
                aria-label={t('Previous image')}
                className='absolute left-2 opacity-0 transition-opacity group-hover:opacity-100'
                onClick={() =>
                  setIndex(
                    (value) =>
                      (value - 1 + props.images.length) % props.images.length
                  )
                }
                size='icon'
                variant='secondary'
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label={t('Next image')}
                className='absolute right-2 opacity-0 transition-opacity group-hover:opacity-100'
                onClick={() =>
                  setIndex((value) => (value + 1) % props.images.length)
                }
                size='icon'
                variant='secondary'
              >
                <ChevronRight />
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
