/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Upload, UserRound, Video, Volume2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type MediaPickerProps = {
  accept: string
  description: string
  icon: typeof UserRound
  label: string
  onFileChange: (file: File | null) => void
  selectedFile: File | null
}

function MediaPicker(props: MediaPickerProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className='border-border bg-muted/20 rounded-xl border border-dashed p-4'>
      <div className='flex items-start gap-3'>
        <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
          <props.icon aria-hidden='true' className='size-4' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>{props.label}</p>
          <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
            {props.selectedFile?.name ?? props.description}
          </p>
          <input
            ref={inputRef}
            accept={props.accept}
            className='sr-only'
            onChange={(event) =>
              props.onFileChange(event.target.files?.[0] ?? null)
            }
            type='file'
          />
          <Button
            className='mt-3'
            onClick={() => inputRef.current?.click()}
            size='sm'
            type='button'
            variant='outline'
          >
            <Upload aria-hidden='true' />
            {t('选择文件')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DigitalHuman() {
  const { t } = useTranslation()
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [script, setScript] = useState('')

  return (
    <div className='bg-muted/20 min-h-full p-4 sm:p-6 lg:p-8'>
      <div className='mx-auto max-w-6xl space-y-6'>
        <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-end'>
          <div>
            <p className='text-primary mb-2 text-xs font-semibold tracking-[0.18em] uppercase'>
              {t('AI 应用')}
            </p>
            <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
              {t('数字人口播')}
            </h1>
            <p className='text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed'>
              {t('上传数字人素材，输入文案即可生成口播视频。')}
            </p>
          </div>
          <div className='border-border text-muted-foreground flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs'>
            <span className='bg-amber-500 size-2 rounded-full' />
            {t('等待接入 HeyGen')}
          </div>
        </div>

        <div className='grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Video aria-hidden='true' className='text-primary size-4' />
                {t('创建视频')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <MediaPicker
                  accept='image/*,video/*'
                  description={t('上传照片或视频作为数字人素材。')}
                  icon={UserRound}
                  label={t('数字人素材')}
                  onFileChange={setAvatarFile}
                  selectedFile={avatarFile}
                />
                <MediaPicker
                  accept='audio/*'
                  description={t('上传声音样本，用于创建克隆声音。')}
                  icon={Volume2}
                  label={t('声音样本')}
                  onFileChange={setVoiceFile}
                  selectedFile={voiceFile}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='digital-human-script'>{t('口播文案')}</Label>
                <Textarea
                  id='digital-human-script'
                  onChange={(event) => setScript(event.target.value)}
                  placeholder={t('输入数字人需要说的内容……')}
                  rows={8}
                  value={script}
                />
                <p className='text-muted-foreground text-xs'>
                  {t('第一版支持输入文字生成视频。')}
                </p>
              </div>

              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='digital-human-avatar-name'>
                    {t('数字人名称')}
                  </Label>
                  <Input
                    id='digital-human-avatar-name'
                    placeholder={t('可选填写')}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='digital-human-aspect-ratio'>
                    {t('画面比例')}
                  </Label>
                  <select
                    className='border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
                    defaultValue='16:9'
                    id='digital-human-aspect-ratio'
                  >
                    <option value='16:9'>16:9</option>
                    <option value='9:16'>9:16</option>
                    <option value='1:1'>1:1</option>
                  </select>
                </div>
              </div>

              <div className='flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center'>
                <p className='text-muted-foreground text-xs'>
                  {t('完成 HeyGen 配置后才能生成视频。')}
                </p>
                <Button disabled={!script.trim()} type='button'>
                  <Video aria-hidden='true' />
                  {t('生成视频')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className='h-fit'>
            <CardHeader>
              <CardTitle className='text-base'>{t('使用流程')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {[
                t('上传照片或视频，创建数字人素材。'),
                t('需要克隆声音时，上传一段声音样本。'),
                t('接入 HeyGen 后，输入文案即可生成视频。'),
              ].map((step, index) => (
                <div className='flex gap-3' key={step}>
                  <span className='bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                    {index + 1}
                  </span>
                  <p className='text-muted-foreground text-sm leading-relaxed'>
                    {step}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
