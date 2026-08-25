/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowRight,
  Box,
  Code2,
  Cpu,
  Globe2,
  KeyRound,
  Terminal,
} from 'lucide-react'
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

const LAVA = '#E85F1A'
const studioAfter = '/images/home/studio-after.webp'
const studioBefore = '/images/home/studio-before.webp'

const ecosystems = [
  [
    'OpenClaw (小龙虾)',
    'AGENT',
    '自动化网络任务与爬虫流，免并发限制。',
    'BASE_URL: https://api.bululu.ai/v1',
  ],
  [
    'Hermes / OpenHermes',
    'REASONING',
    '长上下文深度推理与函数调用无缝中继。',
    'API_KEY: sk-bululu-universal-***',
  ],
  [
    'Claude Code',
    'CLI / IDE',
    '终端原生智能编码助手，突破官方锁区与限流。',
    'ANTHROPIC_BASE_URL: bululu.ai',
  ],
  [
    'Codex / Cursor / Cline',
    'COPILOT',
    '一键填入自定义 Key，实时自动补全代码。',
    'MODEL: gpt-4o / claude-3-7',
  ],
] as const

const supportedTools = [
  { id: 'claude-code', label: 'CLAUDE CODE' },
  { id: 'openclaw', label: 'OPENCLAW' },
  { id: 'hermes-agent', label: 'HERMES AGENT' },
  { id: 'cursor-ai', label: 'CURSOR AI' },
  { id: 'cline', label: 'CLINE' },
  { id: 'dify-workflow', label: 'DIFY WORKFLOW' },
  { id: 'langchain', label: 'LANGCHAIN' },
] as const

const marqueeTools = [
  ...supportedTools.map((tool) => ({ ...tool, id: `${tool.id}-one` })),
  ...supportedTools.map((tool) => ({ ...tool, id: `${tool.id}-two` })),
]

function DashboardLink(props: { children: ReactNode; className?: string }) {
  return (
    <Link
      to='/dashboard'
      className={`transition-colors hover:text-[#E85F1A] ${props.className ?? ''}`}
    >
      {props.children}
    </Link>
  )
}

function SectionHeading(props: {
  eyebrow: string
  title: string
  detail: string
}) {
  const { t } = useTranslation()
  return (
    <div className='bululu-home-section-heading flex flex-col justify-between gap-4 px-6 py-8 sm:px-12 lg:flex-row lg:items-end lg:px-16'>
      <div>
        <div className='mb-2 font-mono text-xs font-bold tracking-wider text-[#E85F1A] uppercase'>
          {t(props.eyebrow)}
        </div>
        <h2 className='max-w-4xl text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.1] font-bold text-[#282825] dark:text-[#E9E7DF]'>
          {t(props.title)}
        </h2>
      </div>
      <div className='font-mono text-xs text-[#706F69] dark:text-[#A4A29A]'>
        {t(props.detail)}
      </div>
    </div>
  )
}

function Hero() {
  const { t } = useTranslation()

  return (
    <section className='bululu-home-hero'>
      <div className='bululu-home-hero-content flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center space-y-8 px-6 py-16 text-center sm:px-12 sm:py-24 lg:px-20 lg:py-28'>
        <div className='inline-flex items-center gap-2 bg-[#FAF9F5] px-3 py-2 font-mono text-xs font-bold text-[#282825] dark:bg-[#282826] dark:text-[#E9E7DF] bululu-home-outline'>
          <span className='size-2 bg-[#E85F1A]' aria-hidden='true' />
          {t('NEXT-GEN AI ASSET ENGINE')}
        </div>
        <h1 className='text-[clamp(2.5rem,8vw,5.5rem)] font-bold tracking-tight text-[#282825] dark:text-[#E9E7DF]'>
          Bululu
        </h1>
        <p className='max-w-3xl text-base leading-relaxed text-[#282825]/80 sm:text-lg dark:text-[#E9E7DF]/80'>
          {t(
            'Bululu 以统一协议中转为起点，聚合全球算力与高可用上游，无缝打通商业级实拍渲染与非线性多模态编排，让每一次创作迸发直接沉淀为可用资产。'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-center gap-3 font-sans text-sm font-bold'>
          <a
            href='#section-api'
            onClick={(event) => {
              event.preventDefault()
              document
                .getElementById('section-api')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className='inline-flex h-11 items-center gap-2 bg-[#282825] px-5 text-[#E9E7DF] transition-colors hover:bg-[#E85F1A]'
          >
            {t('探索核心能力矩阵')} <ArrowDown size={16} aria-hidden='true' />
          </a>
          <DashboardLink className='inline-flex h-11 items-center gap-2 bg-[#FAF9F5] px-5 text-[#282825] dark:bg-[#282826] dark:text-[#E9E7DF] bululu-home-outline'>
            {t('一个 KEY 通吃全模型工具')}{' '}
            <KeyRound size={16} aria-hidden='true' />
          </DashboardLink>
        </div>
      </div>
      <Marquee />
    </section>
  )
}

function Marquee() {
  const { t } = useTranslation()
  const items = [
    '✦ 自动优选全球最佳上游',
    '• 99.8% 极高可用成功率',
    '✦ 一个 URL + 一个 KEY 兼容全生态',
    '• CLAUDE CODE / HERMES / OPENCLAW 全适配',
    '✦ 电商商品图 4K 影棚光影瞬时渲染',
    '• 无限发散资产画布',
  ]
  return (
    <div className='bululu-home-marquee overflow-hidden py-3 font-mono text-xs font-bold tracking-wider whitespace-nowrap'>
      <div className='bululu-marquee inline-flex gap-8'>
        {items.map((item) => (
          <span key={item}>{t(item)}</span>
        ))}
        {items.map((item) => (
          <span key={`${item}-repeat`}>{t(item)}</span>
        ))}
      </div>
    </div>
  )
}

function RoutingSection() {
  const { t } = useTranslation()
  return (
    <section id='section-api' className='bululu-home-section scroll-mt-16'>
      <SectionHeading
        eyebrow='[CAPABILITY 01 // MULTI-UPSTREAM INTELLIGENT ROUTING]'
        title='模型自动路由到最佳上游 · 零感秒级容灾'
        detail='INTELLIGENT DYNAMIC DISPATCHING'
      />
      <div className='bululu-home-metric-grid grid grid-cols-1 md:grid-cols-3'>
        {[
          [
            '[UPSTREAM RELIABILITY]',
            '99.8%',
            '请求成功率 · 上游异常毫秒级热切',
          ],
          ['[SPEED / PING]', '240 ms', '极速响应 · 自动择优最低延迟通道'],
          ['[TOKEN EFFICIENCY]', '-65.4%', '综合成本直降 · 透明按量计费结算'],
        ].map(([label, value, description]) => (
          <div key={label} className='p-6 sm:p-8'>
            <span className='mb-2 block font-mono text-xs text-[#706F69] dark:text-[#A4A29A]'>
              {t(label)}
            </span>
            <div className='text-3xl font-bold text-[#E85F1A] sm:text-4xl'>
              {value}
            </div>
            <div className='mt-2 text-xs text-[#706F69] dark:text-[#A4A29A]'>
              {t(description)}
            </div>
          </div>
        ))}
      </div>
      <div className='bululu-home-routing-layout grid grid-cols-1 lg:grid-cols-12'>
        <div className='space-y-8 p-6 sm:p-12 lg:col-span-5'>
          <div>
            <div className='mb-4 inline-block bg-[#282825] px-2 py-1 font-mono text-[11px] font-bold text-[#E9E7DF]'>
              {t('ROUTING ARCHITECTURE')}
            </div>
            <h3 className='mb-4 text-xl font-bold text-[#282825] dark:text-[#E9E7DF]'>
              {t('上游健康度毫秒级监测')}
            </h3>
            <p className='text-sm leading-relaxed text-[#706F69] dark:text-[#A4A29A]'>
              {t(
                '当你请求同一个模型时，Bululu 实时探测全球 8+ 个主流顶级上游节点的响应延迟、Token 吞吐与限流状态，并将请求自动派发至综合得分最高、最稳定的上游节点。'
              )}
            </p>
          </div>
          <div className='space-y-3 text-sm'>
            {[
              ['上游 A', '28ms', '[OPTIMAL]', 'success'],
              ['上游 B', '142ms', '[ACTIVE]', 'success'],
              ['上游 C', 'RATE-LIMITED', '[STANDBY]', 'warning'],
            ].map(([name, latency, state, tone]) => (
              <div
                key={name}
                className='bululu-home-outline flex items-center justify-between bg-[#EAE8E1] p-3 dark:bg-[#30302D]'
              >
                <span className='flex items-center gap-2'>
                  <span
                    className={`size-2 ${tone === 'success' ? 'bg-[#4C806C]' : 'bg-[#BC771F]'}`}
                    aria-hidden='true'
                  />
                  {t(name)}
                </span>
                <span className='text-[#706F69] dark:text-[#A4A29A]'>
                  <span className='font-mono'>{latency}</span>{' '}
                  <strong
                    className={`font-mono ${tone === 'success' && state === '[OPTIMAL]' ? 'text-[#E85F1A]' : ''}`}
                  >
                    {state}
                  </strong>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className='bg-[#FAF9F5] p-6 sm:p-12 lg:col-span-7 dark:bg-[#282826]'>
          <div className='bululu-home-divider-bottom flex items-center justify-between pb-4 text-xs text-[#706F69] dark:text-[#A4A29A]'>
            <span className='flex items-center gap-2 font-bold text-[#282825] dark:text-[#E9E7DF]'>
              <span className='size-2 bg-[#E85F1A]' aria-hidden='true' />
              {t('REAL-TIME ROUTE DISPATCH VISUALIZER')}
            </span>
            <span className='bululu-home-outline px-2 py-1 font-sans'>
              {t('LIVE DISPATCHING')}
            </span>
          </div>
          <svg
            viewBox='0 0 400 260'
            className='my-8 h-auto w-full overflow-visible'
            role='img'
            aria-label={t('实时路由分发可视化')}
          >
            <path
              d='M 50 130 C 150 130, 180 40, 310 40'
              fill='none'
              stroke={LAVA}
              strokeWidth='2'
              className='bululu-wire'
            />
            <path
              d='M 50 130 C 150 130, 180 130, 310 130'
              fill='none'
              stroke='currentColor'
              className='text-[#706F69]/40'
              strokeWidth='1'
              strokeDasharray='4 4'
            />
            <path
              d='M 50 130 C 150 130, 180 220, 310 220'
              fill='none'
              stroke='currentColor'
              className='text-[#706F69]/40'
              strokeWidth='1'
              strokeDasharray='4 4'
            />
            <circle cx='50' cy='130' r='5' fill={LAVA} />
            <circle cx='310' cy='40' r='5' fill='#4C806C' />
            <circle cx='310' cy='130' r='4' fill='#706F69' />
            <circle cx='310' cy='220' r='4' fill='#BC771F' />
            <text
              x='18'
              y='112'
              fill='currentColor'
              className='text-[#282825] dark:text-[#E9E7DF]'
              fontFamily='var(--font-mono)'
              fontSize='10'
            >
              Bululu 服务
            </text>
            <text
              x='18'
              y='155'
              fill={LAVA}
              fontFamily='var(--font-mono)'
              fontSize='9'
            >
              您的请求
            </text>
            <text
              x='250'
              y='25'
              fill='currentColor'
              className='text-[#282825] dark:text-[#E9E7DF]'
              fontFamily='var(--font-mono)'
              fontSize='9'
            >
              NODE_01
            </text>
            <text
              x='250'
              y='58'
              fill='#4C806C'
              fontFamily='var(--font-mono)'
              fontSize='8'
            >
              BEST 28ms (ACTIVE)
            </text>
            <text
              x='250'
              y='115'
              fill='currentColor'
              className='text-[#706F69]'
              fontFamily='var(--font-mono)'
              fontSize='9'
            >
              NODE_02
            </text>
            <text
              x='250'
              y='148'
              fill='currentColor'
              className='text-[#706F69]'
              fontFamily='var(--font-mono)'
              fontSize='8'
            >
              142ms (BACKUP)
            </text>
            <text
              x='250'
              y='205'
              fill='currentColor'
              className='text-[#706F69]'
              fontFamily='var(--font-mono)'
              fontSize='9'
            >
              NODE_03
            </text>
            <text
              x='250'
              y='238'
              fill='#BC771F'
              fontFamily='var(--font-mono)'
              fontSize='8'
            >
              HIGH LOAD
            </text>
          </svg>
          <div className='bululu-home-divider-top flex flex-wrap justify-between gap-2 pt-4 font-mono text-[11px] text-[#706F69] dark:text-[#A4A29A]'>
            <span>{t('毫秒级无感热切换')}</span>
            <strong className='text-[#E85F1A]'>
              {t('FAILOVER TIME < 50ms')}
            </strong>
          </div>
        </div>
      </div>
    </section>
  )
}

function EcosystemSection() {
  const { t } = useTranslation()
  const icons = [Cpu, Box, Terminal, Code2]
  return (
    <section
      id='section-all-in-one'
      className='bululu-home-section p-6 sm:p-12 lg:p-16'
    >
      <div className='mb-12'>
        <div>
          <span className='mb-2 block font-mono text-xs font-bold tracking-wider text-[#E85F1A] uppercase'>
            {t('[UNIVERSAL KEY CASE // 生态全兼容]')}
          </span>
          <h2 className='max-w-4xl text-[clamp(1.5rem,3vw,2.25rem)] font-bold text-[#282825] dark:text-[#E9E7DF]'>
            {t('一个 URL + 一个 Bululu Key · 通吃全网主流 Agent')}
          </h2>
        </div>
      </div>
      <div className='grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4'>
        {ecosystems.map(([name, type, description, code], index) => {
          const Icon = icons[index]
          return (
            <DashboardLink
              key={name}
              className='bululu-home-outline bg-[#FAF9F5] p-6 dark:bg-[#282826]'
            >
              <div className='mb-4 flex items-center justify-between gap-2'>
                <span className='flex items-center gap-2 font-bold text-[#282825] dark:text-[#E9E7DF]'>
                  <Icon size={16} aria-hidden='true' />
                  {t(name)}
                </span>
                <span className='bululu-home-outline px-2 py-1 font-mono text-[10px]'>
                  {t(type)}
                </span>
              </div>
              <p className='mb-6 min-h-10 text-[11px] leading-relaxed text-[#706F69] dark:text-[#A4A29A]'>
                {t(description)}
              </p>
              <div className='bululu-home-outline truncate bg-[#EAE8E1] p-2.5 font-mono text-[10px] text-[#706F69] dark:bg-[#30302D]'>
                {code}
              </div>
            </DashboardLink>
          )
        })}
      </div>
      <div className='bululu-home-outline mt-12 overflow-hidden bg-[#FAF9F5] py-6 dark:bg-[#282826]'>
        <div className='mb-4 text-center font-mono text-[10px] tracking-widest text-[#706F69] uppercase dark:text-[#A4A29A]'>
          {t('SUPPORTED ECOSYSTEMS & TOOLS')}
        </div>
        <div className='overflow-hidden whitespace-nowrap'>
          <div className='bululu-marquee inline-flex font-mono text-sm font-bold text-[#706F69] dark:text-[#A4A29A]'>
            <div className='flex shrink-0 items-center gap-12'>
              {marqueeTools.map((tool) => (
                <span key={tool.id} className='inline-flex items-center gap-2'>
                  <Globe2
                    size={16}
                    className='text-[#E85F1A]'
                    aria-hidden='true'
                  />
                  {tool.label}
                </span>
              ))}
            </div>
            <div
              className='flex shrink-0 items-center gap-12'
              aria-hidden='true'
            >
              {marqueeTools.map((tool) => (
                <span key={tool.id} className='inline-flex items-center gap-2'>
                  <Globe2
                    size={16}
                    className='text-[#E85F1A]'
                    aria-hidden='true'
                  />
                  {tool.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StudioSection() {
  const { t } = useTranslation()
  const [position, setPosition] = useState(50)
  const updatePosition = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setPosition(
      Math.max(
        0,
        Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)
      )
    )
  }
  const moveWithKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      setPosition((value) =>
        Math.max(0, Math.min(100, value + (event.key === 'ArrowLeft' ? -5 : 5)))
      )
    }
  }
  return (
    <section id='section-studio' className='bululu-home-section'>
      <SectionHeading
        eyebrow='[CAPABILITY 02 // COMMERCIAL STUDIO TRANSFORMATION]'
        title='手机随意随拍 → 顶奢级商拍摄影'
        detail='HARDWARE-ACCELERATED MASKING'
      />
      <div className='grid grid-cols-1 gap-8 p-6 sm:p-12 lg:grid-cols-12 lg:p-16'>
        <div className='lg:col-span-8'>
          <div
            className='bululu-home-outline relative aspect-[4/3] w-full overflow-hidden bg-[#EAE8E1] select-none dark:bg-[#30302D]'
            onPointerDown={updatePosition}
            onPointerMove={(event) => {
              if (event.buttons) updatePosition(event)
            }}
            role='slider'
            aria-label={t('商拍前后对比')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position)}
            tabIndex={0}
            onKeyDown={moveWithKey}
          >
            <img
              src={studioAfter}
              alt={t('After Studio Render')}
              className='absolute inset-0 size-full object-cover contrast-120'
            />
            <span className='absolute top-4 right-4 z-10 bg-[#E85F1A] px-3 py-1.5 font-mono text-xs font-bold text-[#24130E]'>
              {t('✦ BULULU 影棚渲染 (AFTER)')}
            </span>
            <div
              className='absolute inset-0 z-10'
              style={{
                clipPath: `polygon(0 0, ${position}% 0, ${position}% 100%, 0 100%)`,
              }}
            >
              <img
                src={studioBefore}
                alt={t('Before Raw Photo')}
                className='size-full object-cover contrast-80'
              />
              <span className='absolute top-4 left-4 bg-[#20201E] px-3 py-1.5 font-mono text-xs font-bold text-[#E9E7DF]'>
                {t('[RAW: 原始手机拍摄]')}
              </span>
            </div>
            <div
              className='absolute inset-y-0 z-20 w-1 -translate-x-1/2 bg-[#E85F1A]'
              style={{ left: `${position}%` }}
            >
              <div
                className='bululu-home-slider-handle absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-[#E85F1A] font-mono text-xs font-bold text-[#24130E]'
                aria-hidden='true'
              >
                ↔
              </div>
            </div>
          </div>
          <div className='mt-4 flex justify-between gap-4 text-sm text-[#706F69] dark:text-[#A4A29A]'>
            <span>{t('支持鼠标拖拽滑块 · 观察真实微反光与环境阴影投射')}</span>
            <strong className='font-mono text-xs text-[#E85F1A]'>
              {t('4K ULTRA RENDERING')}
            </strong>
          </div>
        </div>
        <div className='space-y-6 lg:col-span-4'>
          <div className='bululu-home-outline bg-[#EAE8E1] p-6 dark:bg-[#30302D]'>
            <div className='mb-2 text-xs text-[#E85F1A]'>
              <span className='font-mono'>CASE STUDY //</span>{' '}
              <span>{t('某新锐香氛品牌')}</span>
            </div>
            <h3 className='mb-4 text-2xl font-bold text-[#282825] dark:text-[#E9E7DF]'>
              {t('从实拍到主图上线仅需 3 分钟')}
            </h3>
            <p className='text-sm leading-relaxed text-[#706F69] dark:text-[#A4A29A]'>
              {t(
                '无需反复打光与购买布景道具。上传主体白底或场景随拍，智能解析物体物理材质，自动生成 100+ 工业几何展台与自然漫反射光影。'
              )}
            </p>
            <div className='bululu-home-divider-top mt-8 space-y-4 pt-6 font-mono text-xs'>
              <div className='flex justify-between'>
                <span>{t('拍摄与后期成本：')}</span>
                <strong className='text-[#E85F1A]'>降低 90%</strong>
              </div>
              <div className='flex justify-between'>
                <span>{t('单批次生成速度：')}</span>
                <strong>
                  4 {t('张')} / 12 {t('秒')}
                </strong>
              </div>
              <div className='flex justify-between'>
                <span>{t('电商转化率提升：')}</span>
                <strong className='text-[#4C806C]'>+28.6% CTR</strong>
              </div>
            </div>
          </div>
          <DashboardLink className='flex h-11 w-full items-center justify-center gap-2 bg-[#282825] font-sans text-sm font-bold text-[#E9E7DF] hover:bg-[#E85F1A]'>
            {t('立即体验商品图制作')}
            <ArrowRight size={16} aria-hidden='true' />
          </DashboardLink>
        </div>
      </div>
    </section>
  )
}

function CTA() {
  const { t } = useTranslation()
  return (
    <section
      id='section-get-started'
      className='relative overflow-hidden bg-[#20201E] p-8 text-[#E9E7DF] sm:p-16 lg:p-20'
    >
      <div className='relative max-w-3xl space-y-6'>
        <div className='inline-block bg-[#E85F1A] px-3 py-1 font-mono text-xs font-bold text-[#24130E]'>
          {t('READY TO ELEVATE YOUR WORKFLOW')}
        </div>
        <h2 className='text-4xl leading-tight font-bold sm:text-6xl'>
          {t('立即开通 BULULU，把算力转化为确定资产')}
          <span className='text-[#E85F1A]'>.</span>
        </h2>
        <p className='max-w-xl text-sm leading-relaxed text-[#A4A29A] sm:text-base'>
          {t('注册即刻获赠测试额度。一处配置，通吃全网大模型工具。')}
        </p>
        <DashboardLink className='inline-flex h-11 items-center gap-2 bg-[#E85F1A] px-5 font-sans text-sm font-bold text-[#24130E] hover:bg-[#FA9A6E]'>
          {t('免费领取 KEY')}
          <ArrowRight size={16} aria-hidden='true' />
        </DashboardLink>
      </div>
    </section>
  )
}

export function BululuHome() {
  return (
    <div className='bululu-home mx-auto w-full max-w-[1440px] overflow-hidden pt-16 text-[#282825] dark:text-[#E9E7DF]'>
      <main id='top'>
        <Hero />
        <div className='bululu-home-content-rail'>
          <RoutingSection />
          <EcosystemSection />
          <StudioSection />
          <CTA />
        </div>
      </main>
    </div>
  )
}
