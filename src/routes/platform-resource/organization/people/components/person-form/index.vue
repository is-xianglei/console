<script setup lang="ts">
import { computed, useCssModule } from 'vue'
import type { FormError } from '@nuxt/ui'
import type { PersonFormModel, PersonValidationIssue } from '@/hooks/usePeopleEditor'

defineOptions({ name: 'PersonForm' })

const props = defineProps<{
  model: PersonFormModel
  /** create：姓名/用户名/邮箱/初始密码/邀请开关；edit：姓名/头像 URL/手机号，用户名与邮箱只读。 */
  mode: 'create' | 'edit'
  issues: PersonValidationIssue[]
  saving: boolean
}>()
const emit = defineEmits<{ cancel: []; save: [] }>()

const styles = useCssModule()
const creating = computed(() => props.mode === 'create')
const formErrors = computed<FormError[]>(() =>
  props.issues.map((issue) => ({ name: issue.field, message: issue.message })),
)

function submit() {
  emit('save')
}
</script>

<template>
  <UForm :state="model" :validate="() => formErrors" :class="styles.form" @submit="submit">
    <div :class="styles.grid">
      <UFormField label="姓名" name="fullName" required><UInput v-model="model.fullName" :class="styles.field" autofocus placeholder="例如：张三" /></UFormField>
      <UFormField label="用户名" name="username" :required="creating" :description="creating ? undefined : '用户名创建后不可修改。'"><UInput v-model="model.username" :class="[styles.field, 'mono']" :disabled="!creating" placeholder="例如：zhangsan" autocomplete="username" /></UFormField>
    </div>
    <UFormField label="邮箱" name="email" :required="creating" :description="creating ? '邮箱需全局唯一，由后端校验。' : '邮箱创建后不可修改。'"><UInput v-model="model.email" :class="styles.field" type="email" :disabled="!creating" placeholder="例如：zhangsan@example.com" autocomplete="email" /></UFormField>
    <UFormField v-if="creating" label="初始密码" name="password" required description="至少 8 位，用户首次登录后可自行修改。"><UInput v-model="model.password" :class="styles.field" type="password" autocomplete="new-password" placeholder="至少 8 位" /></UFormField>
    <template v-else>
      <UFormField label="头像 URL" name="avatarUrl"><UInput v-model="model.avatarUrl" :class="styles.field" placeholder="https://…" /></UFormField>
      <UFormField label="手机号" name="phone"><UInput v-model="model.phone" :class="styles.field" type="tel" placeholder="可选" /></UFormField>
    </template>
    <div v-if="creating" :class="styles.toggle"><span><strong>邀请加入当前工作区</strong><small>创建用户后同步以「成员」角色发送工作区邀请；邀请失败不影响用户已创建。</small></span><USwitch v-model="model.inviteToWorkspace" aria-label="邀请加入当前工作区" /></div>
    <div :class="styles.actions">
      <UButton color="neutral" variant="outline" label="取消" :disabled="saving" @click="emit('cancel')" />
      <UButton type="submit" icon="i-lucide-save" :label="creating ? (model.inviteToWorkspace ? '创建并邀请' : '创建用户') : '保存修改'" :loading="saving" />
    </div>
  </UForm>
</template>

<style module src="./index.module.css"></style>
