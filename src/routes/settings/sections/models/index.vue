<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MODEL_TYPE_LABELS } from '@/constants/settings/models'
import { PROVIDER_STATUS_META, providerStatus, useSettingsModels } from '@/hooks/useSettingsModels'
import type { ModelProviderItem } from '@/interfaces/settings/models/model'
import ProviderFormModal from './components/provider-form-modal/index.vue'

defineOptions({ name: 'ModelsSection' })

const models = useSettingsModels()
const {
  providers, roles, schemas, defaultProviderId, defaultOptions, loading, loadError,
  testingId, assigningRole, savingDefault, pendingDelete, deleting, deleteError,
} = models

/** 首次加载失败（角色列表固定非空，为空即还没拿到数据）时只留错误提示，不显示空态和空下拉。 */
const loadFailed = computed(() => Boolean(loadError.value) && !loading.value && !roles.value.length)
const vendorLabels = computed(() => new Map(schemas.value.map((schema) => [schema.id, schema.label])))

/** 厂商显示名；schema 未加载时退回 provider id。 */
function vendorLabel(item: ModelProviderItem): string {
  return vendorLabels.value.get(item.provider) ?? item.provider
}

function statusOf(item: ModelProviderItem) {
  return PROVIDER_STATUS_META[providerStatus(item)]
}

const formOpen = ref(false)
const editing = ref<ModelProviderItem | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(item: ModelProviderItem) {
  editing.value = item
  formOpen.value = true
}

onMounted(() => { void models.load() })
</script>

<template>
  <div :class="$style.stack">
    <section :class="$style.group">
      <header :class="$style.groupHeader">
        <h3 :class="$style.groupTitle">模型供应商<span :class="$style.count">{{ providers.length }}</span></h3>
        <div :class="$style.groupActions">
          <UTooltip text="刷新">
            <UButton color="neutral" variant="ghost" icon="i-lucide-refresh-cw" square aria-label="刷新" :loading="loading" @click="models.reload" />
          </UTooltip>
          <UButton icon="i-lucide-plus" label="添加模型" :disabled="loading || !schemas.length" @click="openCreate" />
        </div>
      </header>
      <UAlert
        v-if="loadError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="loadError"
        :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: models.reload }]"
      />
      <div v-if="!loadFailed" :class="$style.card">
        <ul v-if="loading && !providers.length" :class="$style.rows" aria-busy="true" aria-label="加载中">
          <li v-for="n in 3" :key="n" :class="$style.row"><USkeleton class="h-10 w-full" /></li>
        </ul>
        <p v-else-if="!providers.length" :class="[$style.cardBody, $style.empty]">还没有模型供应商</p>
        <ul v-else :class="$style.rows">
          <li v-for="item in providers" :key="item.provider_id" :class="$style.row">
            <div :class="$style.rowMain">
              <div :class="$style.rowTitle">
                <UTooltip :text="statusOf(item).label">
                  <UIcon :name="statusOf(item).icon" :class="$style.status" :data-tone="statusOf(item).tone" aria-hidden="true" />
                </UTooltip>
                <span class="sr-only">{{ statusOf(item).label }}</span>
                <span>{{ item.display_name }}</span>
                <UBadge size="xs" color="neutral" variant="soft" :label="MODEL_TYPE_LABELS[item.provider_type] ?? item.provider_type" />
              </div>
              <div :class="$style.rowMeta"><span class="mono">{{ item.model_name }}</span> · {{ vendorLabel(item) }}</div>
            </div>
            <div :class="$style.rowActions">
              <UButton
                color="neutral"
                variant="ghost"
                label="测试"
                :loading="testingId === item.provider_id"
                :disabled="testingId != null && testingId !== item.provider_id"
                @click="models.testProvider(item)"
              />
              <UButton color="neutral" variant="ghost" label="编辑" :disabled="loading || !schemas.length" @click="openEdit(item)" />
              <UButton color="error" variant="ghost" label="删除" @click="models.requestDelete(item)" />
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="roles.length || loading" :class="$style.group">
      <header :class="$style.groupHeader">
        <h3 :class="$style.groupTitle">角色指派</h3>
      </header>
      <div :class="$style.card">
        <ul v-if="!roles.length" :class="$style.rows" aria-busy="true" aria-label="加载中">
          <li v-for="n in 3" :key="n" :class="$style.row"><USkeleton class="h-8 w-full" /></li>
        </ul>
        <ul v-else :class="$style.rows">
          <li v-for="role in roles" :key="role.role_key" :class="$style.row">
            <div :class="$style.rowMain">
              <span :class="$style.rowTitle" :title="role.role_key">{{ role.label }}</span>
            </div>
            <USelectMenu
              :model-value="role.provider_id ?? undefined"
              :class="$style.control"
              :items="models.roleOptions(role)"
              value-key="value"
              placeholder="未分配"
              :search-input="false"
              clear
              :loading="assigningRole === role.role_key"
              :disabled="assigningRole != null && assigningRole !== role.role_key"
              :aria-label="`${role.label} 供应商`"
              @update:model-value="(value: string | null | undefined) => models.assignRole(role.role_key, value)"
            />
          </li>
        </ul>
      </div>
    </section>

    <section v-if="!loadFailed" :class="$style.group">
      <header :class="$style.groupHeader">
        <h3 :class="$style.groupTitle">默认模型</h3>
      </header>
      <div :class="$style.card">
        <div :class="$style.row">
          <div :class="$style.rowMain">
            <span :class="$style.rowTitle">新对话默认使用</span>
          </div>
          <USelectMenu
            :model-value="defaultProviderId ?? undefined"
            :class="$style.control"
            :items="defaultOptions"
            value-key="value"
            placeholder="请选择对话模型"
            :search-input="false"
            :loading="savingDefault"
            aria-label="新对话默认使用的模型"
            @update:model-value="(value: string | null | undefined) => models.setDefaultProvider(value)"
          />
        </div>
      </div>
    </section>

    <UModal
      :open="pendingDelete != null"
      title="确认删除该供应商？"
      :description="pendingDelete ? `将删除「${pendingDelete.display_name}」，删除后无法恢复。` : undefined"
      :dismissible="!deleting"
      :close="!deleting"
      :ui="{ footer: 'justify-end' }"
      @update:open="(open) => { if (!open) models.cancelDelete() }"
    >
      <template v-if="deleteError" #body>
        <UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="deleteError" role="alert" />
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" :disabled="deleting" @click="models.cancelDelete" />
        <UButton color="error" icon="i-lucide-trash-2" label="确认删除" :loading="deleting" :disabled="Boolean(deleteError)" @click="models.confirmDelete" />
      </template>
    </UModal>

    <ProviderFormModal v-model:open="formOpen" :provider="editing" :schemas="schemas" @saved="models.refresh" />
  </div>
</template>

<style module src="./index.module.css"></style>
