<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import PasswordPanel from './profile/PasswordPanel.vue'
import ProfileInfoPanel from './profile/ProfileInfoPanel.vue'
import WorkspacePanel from './profile/WorkspacePanel.vue'

type ProfileTab = 'profile' | 'password' | 'workspaces'

const authStore = useAuthStore()
const activeTab = ref<ProfileTab>('profile')
const user = computed(() => authStore.state.user)
const tabs: { id: ProfileTab; label: string }[] = [
  { id: 'profile', label: '个人信息' },
  { id: 'password', label: '修改密码' },
  { id: 'workspaces', label: '工作区' },
]
</script>

<template>
  <main class="profile-container">
    <section class="profile-card" aria-labelledby="profile-title">
      <header class="profile-header">
        <h1 id="profile-title" class="profile-title">用户资料</h1>
        <div v-if="user" class="profile-user-info">
          <div class="profile-avatar">
            <img v-if="user.avatar_url" :src="user.avatar_url" alt="" />
            <span v-else class="avatar-placeholder">{{ user.username[0].toUpperCase() }}</span>
          </div>
          <div class="profile-user-text">
            <div class="profile-username mono">{{ user.username }}</div>
            <div class="profile-email">{{ user.email }}</div>
          </div>
        </div>
      </header>

      <div class="profile-tabs" role="tablist" aria-label="用户资料设置">
        <button
          v-for="tab in tabs"
          :id="`profile-tab-${tab.id}`"
          :key="tab.id"
          class="tab-btn"
          role="tab"
          :class="{ active: activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`profile-panel-${tab.id}`"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div
        :id="`profile-panel-${activeTab}`"
        class="profile-content"
        role="tabpanel"
        :aria-labelledby="`profile-tab-${activeTab}`"
      >
        <ProfileInfoPanel v-if="activeTab === 'profile'" />
        <PasswordPanel v-else-if="activeTab === 'password'" />
        <WorkspacePanel v-else />
      </div>
    </section>
  </main>
</template>

<style src="./profile/profile-panels.css"></style>

<style scoped>
.profile-container {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-deep);
  padding: 20px;
}

.profile-card {
  width: 100%;
  max-width: 640px;
  padding: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
}

.profile-header { margin-bottom: 24px; }
.profile-title {
  margin-bottom: 20px;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: .02em;
}
.profile-user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}
.profile-avatar {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
}
.profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
  font-family: var(--font-ui);
  font-size: 24px;
  font-weight: 700;
}
.profile-user-text { flex: 1; }
.profile-username { margin-bottom: 4px; color: var(--text-primary); font-size: 16px; font-weight: 600; }
.profile-email { color: var(--text-muted); font-size: 12px; }
.profile-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  padding: 4px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}
.tab-btn {
  height: 36px;
  flex: 1;
  padding: 0 16px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.tab-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.tab-btn.active { background: var(--bg-panel); color: var(--accent-agent); }
.profile-content { min-height: 300px; }
</style>
