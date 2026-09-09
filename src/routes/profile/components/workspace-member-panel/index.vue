<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { computed, reactive, ref } from 'vue'
import type { WorkspaceMemberDetailResponse } from '@/interfaces/workspace/model'
import type { WorkspaceMemberRole } from '@/interfaces/workspace/model'
import { useAuthStore } from '@/stores/auth'
import { useWorkspacesStore } from '@/stores/workspaces'

defineOptions({ name: 'WorkspaceMemberPanel' })

const props = withDefaults(defineProps<{ disabled?: boolean }>(), {
  disabled: false,
})
const authStore = useAuthStore()
const workspacesStore = useWorkspacesStore()
const toast = useToast()
const inviteOpen = ref(false)
const inviting = ref(false)
const roleUpdatingId = ref<number | null>(null)
const pendingRemove = ref<WorkspaceMemberDetailResponse | null>(null)
const removing = ref(false)
const error = ref('')
const inviteForm = reactive({
  email: '',
  role: 'member' as WorkspaceMemberRole,
})
const allRoleItems: Array<{ label: string; value: WorkspaceMemberRole }> = [
  { label: '管理员', value: 'admin' },
  { label: '成员', value: 'member' },
]
const currentUserId = computed(() => authStore.state.user?.id ?? null)
const currentMembership = computed(() => workspacesStore.state.members.find(
  (member) => member.user_id === currentUserId.value,
))
const currentRole = computed(() => currentMembership.value?.role ?? 'member')
const actionDisabled = computed(() => props.disabled || workspacesStore.state.mutating)
const canInvite = computed(() => ['owner', 'admin'].includes(currentRole.value))
const inviteRoleItems = computed(() => (
  currentRole.value === 'owner' ? allRoleItems : allRoleItems.filter((item) => item.value === 'member')
))
const removeDescription = computed(() => (
  pendingRemove.value
    ? `将「${pendingRemove.value.full_name || pendingRemove.value.username}」从当前工作区移除，该成员将立即失去当前工作区访问权限。`
    : ''
))

function showBlockingError(message: string) {
  toast.add({ title: message, color: 'error', icon: 'i-lucide-circle-alert' })
}

function initials(member: WorkspaceMemberDetailResponse) {
  return (member.full_name || member.username).slice(0, 1).toUpperCase()
}

function validateInvite(values: Partial<typeof inviteForm>): FormError[] {
  if (!values.email?.trim()) return [{ name: 'email', message: '请输入成员邮箱' }]
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    return [{ name: 'email', message: '请输入有效的邮箱' }]
  }
  return []
}

function openInvite() {
  if (actionDisabled.value) return
  inviteForm.email = ''
  inviteForm.role = 'member'
  error.value = ''
  inviteOpen.value = true
}

async function refreshAuthWorkspaces() {
  await authStore.loadWorkspaces()
}

async function onInvite() {
  if (inviting.value || actionDisabled.value) return
  inviting.value = true
  error.value = ''
  const message = await workspacesStore.inviteMember({
    email: inviteForm.email.trim(),
    role: inviteForm.role,
  })
  if (!message) await refreshAuthWorkspaces()
  inviting.value = false
  if (message) {
    error.value = message
    return
  }
  inviteOpen.value = false
  toast.add({ title: '邀请已发送', color: 'success', icon: 'i-lucide-mail-check' })
}

function canChangeRole(member: WorkspaceMemberDetailResponse) {
  return currentRole.value === 'owner' && member.role !== 'owner'
}

function editableRole(member: WorkspaceMemberDetailResponse): WorkspaceMemberRole {
  return member.role === 'admin' ? 'admin' : 'member'
}

function canRemove(member: WorkspaceMemberDetailResponse) {
  if (member.user_id === currentUserId.value || member.role === 'owner') return false
  if (currentRole.value === 'owner') return true
  return currentRole.value === 'admin' && member.role === 'member'
}

async function onRoleChange(member: WorkspaceMemberDetailResponse, role: string) {
  if (
    actionDisabled.value
    || roleUpdatingId.value !== null
    || (role !== 'admin' && role !== 'member')
  ) return
  roleUpdatingId.value = member.user_id
  error.value = ''
  const message = await workspacesStore.changeMemberRole(member.user_id, { role })
  if (!message) await refreshAuthWorkspaces()
  roleUpdatingId.value = null
  if (message) {
    error.value = message
    return
  }
  toast.add({ title: '成员角色已更新', color: 'success', icon: 'i-lucide-user-cog' })
}

async function onRemove() {
  const member = pendingRemove.value
  if (!member || removing.value || actionDisabled.value) return
  removing.value = true
  error.value = ''
  const message = await workspacesStore.removeMember(member.user_id)
  if (!message) await refreshAuthWorkspaces()
  removing.value = false
  if (message) {
    showBlockingError(message)
    return
  }
  pendingRemove.value = null
  toast.add({ title: '成员已移除', color: 'success', icon: 'i-lucide-user-minus' })
}
</script>

<template>
  <section :class="$style.section" aria-labelledby="workspace-members-title">
    <header :class="$style.header">
      <div :class="$style.heading">
        <h3 id="workspace-members-title">工作区成员</h3>
        <UBadge
          :label="String(workspacesStore.state.members.length)"
          color="neutral"
          variant="subtle"
        />
      </div>
      <UButton
        v-if="canInvite"
        size="sm"
        icon="i-lucide-user-plus"
        label="邀请成员"
        :disabled="actionDisabled"
        @click="openInvite"
      />
    </header>

    <UAlert
      v-if="error"
      :class="$style.feedback"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
    />

    <div v-if="workspacesStore.state.loading" :class="$style.loading">
      <USkeleton v-for="index in 3" :key="index" class="h-14 w-full" />
    </div>
    <UEmpty
      v-else-if="!workspacesStore.state.members.length"
      variant="naked"
      icon="i-lucide-users"
      title="暂无成员"
    />
    <ul v-else :class="$style.list">
      <li
        v-for="member in workspacesStore.state.members"
        :key="member.id"
        :class="$style.item"
      >
        <span :class="$style.avatar">{{ initials(member) }}</span>
        <div :class="$style.identity">
          <div :class="$style.nameLine">
            <strong>{{ member.full_name || member.username }}</strong>
            <UBadge
              v-if="!member.joined_at"
              label="待接受"
              color="warning"
              variant="subtle"
            />
            <UBadge
              v-if="member.user_id === currentUserId"
              label="我"
              color="primary"
              variant="subtle"
            />
          </div>
          <span>{{ member.email }}</span>
        </div>
        <div :class="$style.actions">
          <USelect
            v-if="canChangeRole(member)"
            :model-value="editableRole(member)"
            :items="allRoleItems"
            value-key="value"
            size="sm"
            :disabled="actionDisabled || roleUpdatingId !== null"
            :loading="roleUpdatingId === member.user_id"
            :aria-label="`更新 ${member.username} 的角色`"
            @update:model-value="onRoleChange(member, String($event))"
          />
          <UBadge
            v-else
            :label="member.role === 'owner' ? '所有者' : member.role === 'admin' ? '管理员' : '成员'"
            :color="member.role === 'owner' ? 'warning' : member.role === 'admin' ? 'info' : 'neutral'"
            variant="subtle"
          />
          <UTooltip v-if="canRemove(member)" text="移除成员">
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              square
              icon="i-lucide-user-minus"
              :disabled="actionDisabled"
              :aria-label="`移除 ${member.username}`"
              @click="pendingRemove = member"
            />
          </UTooltip>
        </div>
      </li>
    </ul>

    <UModal
      v-model:open="inviteOpen"
      title="邀请工作区成员"
      description="被邀请用户接受后即可访问当前工作区。"
      :close="!inviting"
      :dismissible="!inviting"
    >
      <template #body>
        <UForm
          id="workspace-invite-form"
          :state="inviteForm"
          :validate="validateInvite"
          :disabled="inviting"
          :class="$style.inviteForm"
          @submit="onInvite"
        >
          <UFormField label="用户邮箱" name="email" required>
            <UInput v-model="inviteForm.email" class="w-full" type="email" autocomplete="email" />
          </UFormField>
          <UFormField label="成员角色" name="role" required>
            <USelect
              v-model="inviteForm.role"
              class="w-full"
              :items="inviteRoleItems"
              value-key="value"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          label="取消"
          :disabled="inviting"
          @click="inviteOpen = false"
        />
        <UButton
          type="submit"
          form="workspace-invite-form"
          icon="i-lucide-send"
          label="发送邀请"
          :loading="inviting"
        />
      </template>
    </UModal>

    <UModal
      :open="Boolean(pendingRemove)"
      title="移除工作区成员"
      :description="removeDescription"
      :close="!removing"
      :dismissible="!removing"
      @update:open="(open) => { if (!open && !removing) pendingRemove = null }"
    >
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          label="取消"
          :disabled="removing"
          @click="pendingRemove = null"
        />
        <UButton color="error" label="确认移除" :loading="removing" @click="onRemove" />
      </template>
    </UModal>
  </section>
</template>

<style module src="./index.module.css"></style>
