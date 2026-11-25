<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DEFAULT_AVATARS } from '@/constants/settings/profile'
import { maskPhone, useSettingsProfile, validateAvatarUrl } from '@/hooks/useSettingsProfile'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'

defineOptions({ name: 'ProfileSection' })

const router = useRouter()
const authStore = useAuthStore()
const consoleStore = useConsoleStore()
const {
  profile,
  loading,
  loadError,
  displayName,
  editingField,
  draft,
  fieldError,
  savingField,
  savingAvatar,
  load,
  startEdit,
  cancelEdit,
  commitEdit,
  saveAvatar,
} = useSettingsProfile()

const avatarOpen = ref(false)
const avatarUrlDraft = ref('')
const avatarUrlError = ref('')
const logoutOpen = ref(false)
const loggingOut = ref(false)

onMounted(() => { void load() })

function openAvatarPicker() {
  avatarUrlDraft.value = ''
  avatarUrlError.value = ''
  avatarOpen.value = true
}

function closeAvatarPicker() {
  if (!savingAvatar.value) avatarOpen.value = false
}

async function pickAvatar(url: string) {
  if (await saveAvatar(url)) avatarOpen.value = false
}

async function applyAvatarUrl() {
  const error = validateAvatarUrl(avatarUrlDraft.value)
  avatarUrlError.value = error
  if (!error) await pickAvatar(avatarUrlDraft.value)
}

// 与 app-shell 用户菜单的「退出登录」保持同一流程。
async function onLogout() {
  loggingOut.value = true
  try {
    consoleStore.resetConsole()
    authStore.logout()
    await router.replace({ name: 'login' })
  } finally {
    loggingOut.value = false
    logoutOpen.value = false
  }
}
</script>

<template>
  <div :class="$style.stack">
    <section :class="$style.group" aria-label="个人信息">
      <UCard :ui="{ body: 'py-0 sm:py-0' }">
        <ul :class="$style.rows">
          <li v-if="loading && !profile" :class="$style.row">
            <USkeleton class="size-14 rounded-full" />
            <div :class="$style.rowMain">
              <USkeleton class="h-5 w-32" />
              <USkeleton class="h-4 w-56" />
            </div>
          </li>
          <li v-else-if="loadError" :class="$style.row">
            <div :class="$style.rowMain"><span :class="$style.rowMeta">{{ loadError }}</span></div>
            <div :class="$style.rowActions">
              <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" label="重试" @click="load" />
            </div>
          </li>
          <template v-else-if="profile">
            <li :class="$style.row">
              <UButton :class="$style.avatarButton" color="neutral" variant="link" aria-label="更换头像" @click="openAvatarPicker">
                <UAvatar :class="$style.avatar" :src="profile.avatar_url || undefined" :alt="displayName" />
                <span :class="$style.avatarOverlay" aria-hidden="true">
                  <UIcon name="i-lucide-pencil" />
                </span>
              </UButton>
              <div :class="$style.rowMain">
                <div v-if="editingField === 'full_name'" :class="$style.inlineEditor">
                  <UInput
                    v-model="draft"
                    :class="$style.editorInput"
                    :color="fieldError ? 'error' : 'primary'"
                    :highlight="Boolean(fieldError)"
                    :disabled="savingField"
                    autofocus
                    aria-label="姓名"
                    placeholder="输入姓名"
                    @keydown.enter.prevent="commitEdit"
                    @keydown.esc.prevent.stop="cancelEdit"
                  />
                  <UButton color="primary" variant="ghost" icon="i-lucide-check" aria-label="保存" :loading="savingField" @click="commitEdit" />
                  <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="取消" :disabled="savingField" @click="cancelEdit" />
                </div>
                <div v-else :class="$style.nameLine">
                  <span :class="$style.userName">{{ displayName }}</span>
                  <UButton color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="修改姓名" :disabled="savingField" @click="startEdit('full_name')" />
                </div>
                <p v-if="editingField === 'full_name' && fieldError" :class="$style.fieldError">{{ fieldError }}</p>
                <span :class="$style.rowMeta">{{ profile.username }} · {{ profile.email }}</span>
              </div>
            </li>
            <li :class="$style.row">
              <div :class="$style.rowMain">
                <span :class="$style.rowTitle">手机号</span>
                <p v-if="editingField === 'phone' && fieldError" :class="$style.fieldError">{{ fieldError }}</p>
              </div>
              <div v-if="editingField === 'phone'" :class="[$style.rowActions, $style.phoneEditor]">
                <UInput
                  v-model="draft"
                  :class="$style.editorInput"
                  :color="fieldError ? 'error' : 'primary'"
                  :highlight="Boolean(fieldError)"
                  :disabled="savingField"
                  type="tel"
                  autocomplete="tel"
                  autofocus
                  aria-label="手机号"
                  placeholder="输入手机号"
                  @keydown.enter.prevent="commitEdit"
                  @keydown.esc.prevent.stop="cancelEdit"
                />
                <UButton color="primary" variant="ghost" icon="i-lucide-check" aria-label="保存" :loading="savingField" @click="commitEdit" />
                <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="取消" :disabled="savingField" @click="cancelEdit" />
              </div>
              <div v-else :class="$style.rowActions">
                <span :class="$style.phoneValue">{{ maskPhone(profile.phone) || '未设置' }}</span>
                <UButton color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="修改手机号" :disabled="savingField" @click="startEdit('phone')" />
              </div>
            </li>
          </template>
        </ul>
      </UCard>
    </section>

    <section :class="$style.group" aria-labelledby="profile-account-title">
      <header :class="$style.groupHeader">
        <h3 id="profile-account-title" :class="$style.groupTitle">账号</h3>
      </header>
      <UCard :ui="{ body: 'py-0 sm:py-0' }">
        <ul :class="$style.rows">
          <li :class="$style.row">
            <div :class="$style.rowMain">
              <span :class="$style.rowTitle">退出登录</span>
              <span :class="$style.rowMeta">退出不会丢失任何数据</span>
            </div>
            <div :class="$style.rowActions">
              <UButton color="error" variant="outline" icon="i-lucide-log-out" label="退出" @click="logoutOpen = true" />
            </div>
          </li>
        </ul>
      </UCard>
    </section>

    <UModal
      :open="avatarOpen"
      title="选择头像"
      :close="!savingAvatar"
      :dismissible="!savingAvatar"
      @update:open="(open) => { if (!open) closeAvatarPicker() }"
    >
      <template #body>
        <div :class="$style.avatarPicker">
          <div :class="$style.avatarGrid">
            <UButton
              v-for="item in DEFAULT_AVATARS"
              :key="item.id"
              :class="[$style.avatarOption, profile?.avatar_url === item.url && $style.avatarOptionActive]"
              color="neutral"
              variant="ghost"
              :aria-label="`默认头像 ${item.id.slice(-1)}`"
              :aria-pressed="profile?.avatar_url === item.url"
              :disabled="savingAvatar"
              @click="pickAvatar(item.url)"
            >
              <UAvatar :src="item.url" alt="" :class="$style.avatarOptionImage" />
            </UButton>
          </div>
          <UFormField label="头像 URL" name="avatarUrl" :error="avatarUrlError || false">
            <div :class="$style.urlLine">
              <UInput
                v-model="avatarUrlDraft"
                :class="$style.editorInput"
                type="url"
                autocomplete="off"
                placeholder="https://..."
                :disabled="savingAvatar"
                @update:model-value="avatarUrlError = ''"
                @keydown.enter.prevent="applyAvatarUrl"
              />
              <UButton label="使用" :loading="savingAvatar" :disabled="!avatarUrlDraft.trim()" @click="applyAvatarUrl" />
            </div>
          </UFormField>
        </div>
      </template>
    </UModal>

    <UModal
      :open="logoutOpen"
      title="确认退出登录？"
      description="退出登录不会丢失任何数据，你仍可以登录此账号。"
      :close="!loggingOut"
      :dismissible="!loggingOut"
      :ui="{ footer: 'justify-end' }"
      @update:open="(open) => { if (!open && !loggingOut) logoutOpen = false }"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" :disabled="loggingOut" @click="logoutOpen = false" />
        <UButton color="error" icon="i-lucide-log-out" label="退出登录" :loading="loggingOut" @click="onLogout" />
      </template>
    </UModal>
  </div>
</template>

<style module src="./index.module.css"></style>
