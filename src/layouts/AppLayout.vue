<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-center">
        <div class="brand">VisionTale</div>
        <StepProgress />
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import StepProgress from "../components/StepProgress.vue";
</script>
