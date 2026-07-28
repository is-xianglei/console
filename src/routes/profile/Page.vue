<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import PasswordPanel from '@/routes/profile/components/password-panel/index.vue'
import ProfileInfoPanel from '@/routes/profile/components/profile-info-panel/index.vue'
import WorkspacePanel from '@/routes/profile/components/workspace-panel/index.vue'

defineOptions({ name: 'ProfilePage' })

type ProfileTab = 'profile' | 'password' | 'workspaces'

const authStore = useAuthStore()
const activeTab = ref<ProfileTab>('profile')
const user = computed(() => authStore.state.user)
const tabs: { id: ProfileTab; value: ProfileTab; label: string }[] = [
  { id: 'profile', value: 'profile', label: '个人信息' },
  { id: 'password', value: 'password', label: '修改密码' },
  { id: 'workspaces', value: 'workspaces', label: '工作区' },
]
</script>

<template>
  <main :class="$style.container">
    <section :class="$style.card" aria-labelledby="profile-title">
      <header :class="$style.header">
        <h1 id="profile-title" :class="$style.title">用户资料</h1>
        <div v-if="user" :class="$style.userInfo">
          <div :class="$style.avatar">
            <img v-if="user.avatar_url" :src="user.avatar_url" alt="" />
            <span v-else :class="$style.avatarPlaceholder">{{ user.username[0].toUpperCase() }}</span>
          </div>
          <div :class="$style.userText">
            <div class="mono" :class="$style.username">{{ user.username }}</div>
            <div :class="$style.email">{{ user.email }}</div>
          </div>
        </div>
      </header>

      <UTabs
        v-model="activeTab"
        :class="$style.tabs"
        :items="tabs"
        variant="link"
        :unmount-on-hide="true"
        :ui="{ trigger: 'grow' }"
      >
        <template #content="{ item }">
          <div :class="$style.content">
            <ProfileInfoPanel v-if="item.id === 'profile'" />
            <PasswordPanel v-else-if="item.id === 'password'" />
            <WorkspacePanel v-else />
          </div>
        </template>
      </UTabs>
    </section>
  </main>
</template>

<style module src="./index.module.css"></style>
