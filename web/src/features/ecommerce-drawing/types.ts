export type Purpose = 'main' | 'use' | 'model' | 'detail' | 'mood' | 'custom'
export type Presentation = 'alone' | 'scene' | 'person' | 'set'
export type Focus =
  | 'overall'
  | 'material'
  | 'size'
  | 'fit'
  | 'texture'
  | 'state'
  | 'structure'
  | 'set'
  | 'selling'
export type SceneType = 'simple' | 'home' | 'outdoor' | 'work' | 'festival'
export type PersonSceneType = Exclude<SceneType, 'simple'>
export type Pose = 'natural' | 'use' | 'wear'
export type SetScope = 'package' | 'full' | 'named'
export type DetailType =
  | 'function'
  | 'structure'
  | 'material'
  | 'set'
  | 'steps'
  | 'before_after'
export type VisualStyle =
  | 'none'
  | 'minimal'
  | 'premium'
  | 'natural'
  | 'vibrant'
  | 'editorial'
export type Composition = 'center' | 'left' | 'right'
export type Channel = 'listing' | 'detail' | 'social'
export type ReferenceRole =
  | 'productImage'
  | 'sceneImage'
  | 'personImage'
  | 'personSceneImage'
  | 'styleImage'

export interface EcommerceDraft {
  purpose: Purpose
  customPurpose: string
  name: string
  category: string
  facts: string
  productImage: File | null
  presentation: Presentation
  sceneType: SceneType
  sceneImage: File | null
  pose: Pose
  personImage: File | null
  personScene: boolean
  personSceneType: PersonSceneType
  personSceneImage: File | null
  setScope: SetScope
  namedAccessory: string
  focus: Focus
  sellingPoint: string
  detailType: DetailType
  style: VisualStyle
  styleImage: File | null
  composition: Composition
  channel: Channel
  copy: string
}

export interface GenerationSettings {
  aspectRatio: string
  resolution: string
  quality: string
}

export type StepNumber = 1 | 2 | 3 | 4 | 5
export type DraftErrors = Partial<Record<keyof EcommerceDraft, string>>

export type Option<T extends string> = {
  value: T
  label: string
}
