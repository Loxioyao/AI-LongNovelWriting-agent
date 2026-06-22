<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<script setup>
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()

onMounted(() => {
  settings.loadConfig()
})
</script>
