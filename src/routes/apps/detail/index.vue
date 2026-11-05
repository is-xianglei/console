<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
import { RelativeTime } from '@/components'
import { MARKET_KIND_LABELS, MARKET_LISTING_STATUS_META } from '@/constants/market'
import type { MarketInstallOutcome } from '@/stores/market'
import type { MarketInstallResult } from '@/interfaces/market/model'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'
import { getCategoryLabel, getInstallActionState, getInstallUnavailableText, isMarketWriter } from '@/utils/market'
import ReasonModal from '../components/reason-modal/index.vue'
import ReportSummary from '../components/report-summary/index.vue'
import SnapshotView from '../components/snapshot-view/index.vue'

/**
 * 市场条目详情：当前版本快照全文 + 当前工作区的安装 / 升级预览。
 * 安装或升级完成后弹出报告；平台管理员可在这里强制下架社区条目。
 */
defineOptions({ name: 'MarketDetailPage' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()
const marketStore = useMarketStore()

const notFound = ref(false)
/** 网络错误、5xx 等加载失败的提示；与 404 的「不存在」分开显示，可重试。 */
const loadError = ref('')
const installing = ref(false)
/** 最近一次安装或升级的结果，非空时弹出报告。 */
const installResult = ref<MarketInstallResult | null>(null)
const installMode = ref<'install' | 'upgrade'>('install')
const removeOpen = ref(false)
const removing = ref(false)

const listingId = computed(() => {
  const value = route.params.id
  if (Array.isArray(value)) return Number(value[0])
  return Number(value)
})

/** store 里可能还是上一个条目的详情，id 对不上时按未加载处理。 */
const detail = computed(() => {
  const current = marketStore.state.detail
  if (current && current.listing.id === listingId.value) return current
  return null
})

const canWrite = computed(() => isMarketWriter(authStore.currentWorkspace?.membership_role))

/** 条目名称；条目的 name 为空时用当前版本的名称。 */
const displayName = computed(() => {
  const current = detail.value
  if (!current) return ''
  if (current.listing.name) return current.listing.name
  if (current.current_version) return current.current_version.name
  return '未命名条目'
})

const actionState = computed(() => {
  if (!detail.value) return null
  return getInstallActionState(detail.value, canWrite.value)
})

/** 已装且已是最新版本时，后端不再计算报告，预览区只提示一句。 */
const upToDate = computed(() => {
  const preview = detail.value?.install_preview
  if (!preview || preview.installed_version_number === null) return false
  return preview.installed_version_number >= preview.target_version_number
})

/** 平台管理员可以强制下架社区条目（已上架或作者下架状态），口径与后端一致。 */
const canRemove = computed(() => {
  const current = detail.value
  if (!current || !authStore.isPlatformAdmin) return false
  if (current.listing.is_official) return false
  return current.status === 'listed' || current.status === 'delisted'
})

/** 安装报告里「查看已安装的对象」的跳转目标。 */
const installedRoute = computed<RouteLocationRaw | null>(() => {
  const install = installResult.value?.install
  if (!install) return null
  if (install.target_agent_id !== null) return { name: 'agent-detail', params: { id: String(install.target_agent_id) } }
  if (install.target_skill_id !== null) return { name: 'skill-detail', params: { id: String(install.target_skill_id) } }
  return null
})

async function load() {
  notFound.value = false
  loadError.value = ''
  if (!Number.isInteger(listingId.value)) {
    notFound.value = true
    return
  }
  const error = await marketStore.loadDetail(listingId.value)
  if (!error) return
  // 未上架的条目只有发布方和平台管理员能看，其他人也是 404。
  if (error.status === 404) {
    notFound.value = true
    return
  }
  loadError.value = error.message
}

// 换条目、切换工作区（安装预览按工作区计算）都重新拉取。
watch(
  () => [listingId.value, authStore.currentWorkspaceId],
  () => {
    void load()
  },
  { immediate: true },
)

onMounted(() => {
  void marketStore.loadCategories()
})

/** 安装或升级；成功弹出报告，失败展示后端的中文说明。两种情况都重新拉详情刷新预览。 */
async function onInstall() {
  const current = detail.value
  if (!current || !current.install_preview || installing.value) return
  const mode = current.install_preview.mode

  installing.value = true
  let outcome: MarketInstallOutcome
  if (mode === 'upgrade') {
    outcome = await marketStore.upgradeListing(current.listing.id)
  } else {
    outcome = await marketStore.installListing(current.listing.id)
  }
  installing.value = false

  if (!outcome.result) {
    let title = '安装失败'
    if (mode === 'upgrade') title = '升级失败'
    toast.add({ title, description: outcome.error ?? undefined, color: 'error', icon: 'i-lucide-circle-alert' })
    // 失败可能是预览之后本地数据变了（例如刚新建了同名 Agent），刷新预览让按钮状态跟上。
    void load()
    return
  }
  installMode.value = mode
  installResult.value = outcome.result
  void load()
}

function closeReport() {
  installResult.value = null
}

async function onRemoveSubmit(reason: string) {
  const current = detail.value
  if (!current || removing.value) return
  removing.value = true
  const error = await marketStore.removeListing(current.listing.id, reason)
  removing.value = false
  if (error) {
    toast.add({ title: '强制下架失败', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  removeOpen.value = false
  toast.add({ title: '已强制下架', color: 'success', icon: 'i-lucide-ban' })
  void load()
}

/** 从市场内跳转过来时返回上一页（保留筛选和分页）；直接打开链接时回到「发现」。 */
function goBack() {
  if (window.history.state?.back) {
    router.back()
    return
  }
  void router.push({ name: 'apps', params: { section: 'discover' } })
}
</script>

<template>
  <main :class="$style.page">
    <div :class="$style.inner">
      <header :class="$style.toolbar">
        <UButton icon="i-lucide-arrow-left" label="应用市场" color="neutral" variant="ghost" @click="goBack" />
        <UButton v-if="canRemove" label="强制下架" icon="i-lucide-ban" color="error" variant="outline" @click="removeOpen = true" />
      </header>

      <div v-if="marketStore.state.detailLoading && !detail" :class="$style.skeletons" aria-busy="true">
        <USkeleton :class="$style.skeletonHero" />
        <USkeleton :class="$style.skeletonBody" />
      </div>

      <UEmpty v-else-if="notFound" variant="naked" icon="i-lucide-package-search" title="条目不存在或未上架">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" label="返回市场" color="neutral" variant="outline" @click="goBack" />
        </template>
      </UEmpty>

      <UEmpty v-else-if="loadError" variant="naked" icon="i-lucide-cloud-off" title="条目加载失败" :description="loadError">
        <template #actions>
          <UButton icon="i-lucide-refresh-cw" label="重试" color="neutral" variant="outline" @click="load" />
        </template>
      </UEmpty>

      <template v-else-if="detail">
        <section :class="$style.hero">
          <span :class="$style.heroIcon">
            <UIcon :name="detail.listing.kind === 'agent' ? 'i-lucide-bot' : 'i-lucide-wrench'" />
          </span>
          <div :class="$style.heroText">
            <div :class="$style.titleRow">
              <h1 :class="$style.name">{{ displayName }}</h1>
              <span v-if="detail.listing.current_version_number" :class="[$style.ver, 'mono']">v{{ detail.listing.current_version_number }}</span>
              <UBadge v-if="detail.listing.is_official" label="官方" color="primary" variant="subtle" size="xs" />
            </div>
            <p v-if="detail.listing.summary" :class="$style.summary">{{ detail.listing.summary }}</p>
            <div :class="$style.tags">
              <UBadge :label="MARKET_KIND_LABELS[detail.listing.kind]" color="neutral" variant="soft" size="xs" />
              <UBadge
                v-if="detail.listing.category"
                :label="getCategoryLabel(marketStore.state.categories, detail.listing.category)"
                color="neutral"
                variant="outline"
                size="xs"
              />
              <UBadge v-if="detail.listing.installed" :label="`已安装 v${detail.listing.installed_version_number}`" color="success" variant="subtle" size="xs" />
              <UBadge v-if="detail.listing.has_update" label="有新版本" color="warning" variant="subtle" size="xs" />
            </div>
            <dl :class="$style.meta">
              <div><dt>发布方</dt><dd>{{ detail.listing.publisher_name || '—' }}</dd></div>
              <div><dt>安装次数</dt><dd class="mono">{{ detail.listing.install_count }}</dd></div>
              <div><dt>更新</dt><dd><RelativeTime :value="detail.listing.updated_at" /></dd></div>
            </dl>
          </div>
        </section>

        <UAlert
          v-if="detail.status !== 'listed'"
          :class="$style.statusAlert"
          color="warning"
          variant="subtle"
          icon="i-lucide-archive"
          :title="`该条目${MARKET_LISTING_STATUS_META[detail.status].label}，不能安装或升级`"
          :description="detail.status_reason ? `原因：${detail.status_reason}` : undefined"
        />

        <div :class="$style.grid">
          <section :class="$style.content" aria-label="当前版本内容">
            <template v-if="detail.current_version">
              <p v-if="detail.current_version.release_note" :class="$style.releaseNote">
                <span>v{{ detail.current_version.version_number }} 版本说明</span>{{ detail.current_version.release_note }}
              </p>
              <SnapshotView :snapshot="detail.current_version.snapshot" />
            </template>
            <UEmpty v-else variant="naked" icon="i-lucide-file-question" title="还没有审核通过的版本" />
          </section>

          <aside :class="$style.side">
            <div :class="$style.card">
              <h2 :class="$style.cardTitle">
                <template v-if="detail.install_preview?.mode === 'upgrade'">升级预览</template>
                <template v-else>安装预览</template>
              </h2>

              <template v-if="detail.install_preview">
                <p :class="$style.previewMeta">
                  <template v-if="detail.install_preview.mode === 'upgrade'">
                    已安装 v{{ detail.install_preview.installed_version_number }}，当前版本 v{{ detail.install_preview.target_version_number }}
                  </template>
                  <template v-else>
                    将 v{{ detail.install_preview.target_version_number }} 安装到当前工作区
                  </template>
                </p>

                <p v-if="upToDate" :class="$style.previewNote">已是最新版本，无需升级。</p>
                <template v-else>
                  <div v-if="detail.listing.kind === 'agent' && detail.install_preview.mode === 'install'" :class="$style.nameCheck">
                    <span>Agent 名称</span>
                    <UBadge v-if="detail.install_preview.agent_name_conflict" label="本工作区已有同名 Agent" color="error" variant="subtle" size="xs" />
                    <UBadge v-else label="无同名冲突" color="success" variant="subtle" size="xs" />
                  </div>
                  <ReportSummary :report="detail.install_preview.report" :kind="detail.listing.kind" />
                </template>
              </template>
              <!-- 没有预览说明条目不是已上架状态，下架原因见页面顶部提示；这时也不显示安装、升级按钮。 -->
              <p v-else :class="$style.previewNote">{{ getInstallUnavailableText(detail.status) }}</p>

              <template v-if="actionState">
                <UButton
                  block
                  :label="actionState.label"
                  :icon="detail.install_preview?.mode === 'upgrade' ? 'i-lucide-arrow-up-circle' : 'i-lucide-download'"
                  :disabled="actionState.disabled || installing"
                  :loading="installing"
                  @click="onInstall"
                />
                <p v-if="actionState.reason" :class="$style.blocker">{{ actionState.reason }}</p>
              </template>
            </div>
          </aside>
        </div>
      </template>
    </div>

    <UModal
      :open="installResult !== null"
      :title="installMode === 'upgrade' ? '升级完成' : '安装完成'"
      :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
      @update:open="(open: boolean) => { if (!open) closeReport() }"
    >
      <template #body>
        <div v-if="installResult && detail" :class="$style.report">
          <p :class="$style.previewMeta">当前工作区已安装 v{{ installResult.install.installed_version_number }}</p>
          <ReportSummary :report="installResult.report" :kind="detail.listing.kind" />
        </div>
      </template>
      <template #footer>
        <UButton
          v-if="installedRoute"
          :label="detail?.listing.kind === 'agent' ? '查看 Agent' : '查看 Skill'"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-arrow-up-right"
          :to="installedRoute"
        />
        <UButton label="完成" @click="closeReport" />
      </template>
    </UModal>

    <ReasonModal
      :open="removeOpen"
      :title="`强制下架「${displayName}」？`"
      description="下架后全平台不可浏览和安装，已安装的副本不受影响；作者只能提交新版本重新审核。"
      label="下架理由"
      submit-label="强制下架"
      required
      submit-color="error"
      :saving="removing"
      @update:open="(open: boolean) => { removeOpen = open }"
      @submit="onRemoveSubmit"
    />
  </main>
</template>

<style module src="./index.module.css"></style>
