<script setup lang="ts">
defineProps<{
  users: ReadonlyArray<{ readonly id: string; readonly name: string }> | undefined;
  /** Why the last fetch failed; shown instead of any stale users. */
  errorMessage: string | undefined;
  isFetching: boolean;
}>();

defineEmits<{ refetch: [] }>();
</script>

<template>
  <section class="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
    <h2 class="text-2xl font-semibold">Users</h2>
    <p class="text-stone-600">Read-only example backed by Drizzle and PostgreSQL.</p>
    <button
      type="button"
      class="rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50"
      :disabled="isFetching"
      @click="$emit('refetch')"
    >
      {{ isFetching ? "Loading..." : "Refetch" }}
    </button>
    <p v-if="errorMessage !== undefined" class="text-sm text-red-700">{{ errorMessage }}</p>
    <p v-else-if="users === undefined" class="text-sm text-stone-600">Loading users...</p>
    <ul v-else-if="users.length" class="space-y-2">
      <li v-for="user in users" :key="user.id" class="rounded-md border border-stone-200 p-3">
        {{ user.name }}
      </li>
    </ul>
    <p v-else class="text-sm text-stone-600">
      No users yet. The starter intentionally ships without seed data.
    </p>
  </section>
</template>
