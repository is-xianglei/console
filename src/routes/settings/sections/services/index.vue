<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  getServiceConfigControl,
  getServiceConfigOptions,
  isServiceConfigEnabled,
  useSettingsServices,
} from '@/hooks/useSettingsServices'
import type { ServiceConfigItem } from '@/interfaces/settings/services/model'

defineOptions({ name: 'ServicesSection' })

const services = useSettingsServices()
const { groups, loading, loaded, saving, testingGroup, pendingUpdates } = services
/** 已切换为明文显示的密钥项。 */
const revealed = reactive(new Set<string>())

function controlId(item: ServiceConfigItem) {
  return `service-config-${item.config_key}`
}

function toggleReveal(key: string) {
  if (revealed.has(key)) revealed.delete(key)
  else revealed.add(key)
}

/** 首次加载失败时显示重试入口；初始渲染时 loading 尚未置位，不能用 !loaded && !loading 判断。 */
const loadFailed = ref(false)

async function reload() {
  loadFailed.value = !(await services.load()) && !loaded.value
}

onMounted(() => { void reload() })
</script>

<template>
  <div :class="$style.stack">
    <div v-if="!loaded && loading" :class="$style.card">
      <div :class="$style.cardBody"><USkeleton class="h-40 w-full" /></div>
    </div>
    <UEmpty
      v-else-if="loaded && !groups.length"
      variant="naked"
      icon="i-lucide-server-cog"
      title="暂无服务配置"
    />
    <UAlert
      v-else-if="loadFailed && !loading"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="加载服务配置失败"
      :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: reload }]"
    />

    <section
      v-for="group in groups"
      :key="group.group_key"
      :class="$style.group"
      :aria-labelledby="`service-group-${group.group_key}`"
    >
      <header :class="$style.groupHeader">
        <h3 :id="`service-group-${group.group_key}`" :class="$style.groupTitle">{{ group.label }}</h3>
        <div v-if="group.testable" :class="$style.groupActions">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-zap"
            label="测试"
            :loading="testingGroup === group.group_key"
            :disabled="saving"
            @click="services.test(group)"
          />
        </div>
      </header>

      <div :class="$style.card">
        <ul :class="$style.rows">
          <li v-for="item in services.visibleItems(group)" :key="item.config_key" :class="$style.row">
            <div :class="$style.rowMain">
              <span :class="$style.rowTitle">
                <label :for="controlId(item)">{{ item.display_name }}</label>
                <UTooltip v-if="item.description" :text="item.description" :ui="{ content: $style.tipContent, text: $style.tipText }">
                  <UIcon name="i-lucide-info" :class="$style.hint" role="img" tabindex="0" :aria-label="item.description" />
                </UTooltip>
              </span>
            </div>
            <div v-if="getServiceConfigControl(item) === 'boolean'" :class="$style.rowActions">
              <USwitch
                :id="controlId(item)"
                :model-value="isServiceConfigEnabled(services.valueOf(item))"
                :disabled="saving"
                @update:model-value="(value: boolean) => services.setValue(item, value ? 'true' : 'false')"
              />
            </div>
            <div v-else :class="[$style.rowActions, $style.control]">
              <USelect
                v-if="getServiceConfigControl(item) === 'enum'"
                :id="controlId(item)"
                class="w-full"
                :model-value="services.valueOf(item).toLowerCase() || undefined"
                :items="getServiceConfigOptions(item)"
                placeholder="未配置"
                :disabled="saving"
                @update:model-value="services.setValue(item, String($event))"
              />
              <UInput
                v-else-if="getServiceConfigControl(item) === 'secret'"
                :id="controlId(item)"
                class="w-full"
                :model-value="services.valueOf(item)"
                :type="revealed.has(item.config_key) ? 'text' : 'password'"
                placeholder="未配置"
                autocomplete="new-password"
                :disabled="saving"
                :ui="{ trailing: 'pe-1' }"
                @update:model-value="services.setValue(item, String($event))"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="revealed.has(item.config_key) ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="revealed.has(item.config_key) ? '隐藏' : '显示'"
                    :aria-pressed="revealed.has(item.config_key)"
                    :aria-controls="controlId(item)"
                    @click="toggleReveal(item.config_key)"
                  />
                </template>
              </UInput>
              <UInput
                v-else
                :id="controlId(item)"
                class="w-full"
                :model-value="services.valueOf(item)"
                placeholder="未配置"
                :disabled="saving"
                @update:model-value="services.setValue(item, String($event))"
              />
            </div>
          </li>
        </ul>
      </div>
    </section>

    <Transition :enter-active-class="$style.saveBarEnter">
      <div v-if="pendingUpdates.length" :class="$style.saveBar" role="region" aria-label="未保存的改动">
        <span :class="$style.saveBarText" aria-live="polite">{{ pendingUpdates.length }} 项改动未保存</span>
        <div :class="$style.saveBarActions">
          <UButton color="neutral" variant="ghost" label="放弃" :disabled="saving" @click="services.discard()" />
          <UButton icon="i-lucide-save" label="保存" :loading="saving" @click="services.save()" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style module src="./index.module.css"></style>
