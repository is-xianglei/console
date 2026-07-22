<script setup lang="ts">
import { onMounted } from 'vue'
import { useSkillsStore } from '../../stores/skills'
import SkillDetailPanel from './SkillDetailPanel.vue'
import SkillListPanel from './SkillListPanel.vue'

const { loadSkills } = useSkillsStore()

onMounted(() => {
  void loadSkills()
})
</script>

<template>
  <main class="skills-page">
    <SkillListPanel />
    <SkillDetailPanel />
  </main>
</template>

<style scoped>
.skills-page {
  flex: 1;
  display: flex;
  min-width: 0;
  background: var(--bg-deep);
}
</style>
