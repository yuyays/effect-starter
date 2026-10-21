<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { usersQueryOptions } from "../lib/users.js";

const { data, isError, isFetching, refetch } = useQuery(usersQueryOptions);
</script>

<template>
  <main class="min-h-screen bg-stone-50 px-6 py-10 text-stone-950">
    <section class="mx-auto flex max-w-4xl flex-col gap-8">
      <div class="space-y-3">
        <p class="text-sm font-medium uppercase tracking-widest text-cyan-700">Effect starter</p>
        <h1 class="max-w-2xl text-5xl font-semibold tracking-tight">
          Vue client, Effect Platform API, shared contracts.
        </h1>
        <p class="max-w-2xl text-lg text-stone-600">
          TanStack Query calls an Effect HttpApiClient generated from the same API contract the
          server implements.
        </p>
      </div>
      <section class="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 class="text-2xl font-semibold">Users</h2>
        <p class="text-stone-600">Read-only example backed by Drizzle and PostgreSQL.</p>
        <button
          type="button"
          class="rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50"
          :disabled="isFetching"
          @click="refetch()"
        >
          {{ isFetching ? "Loading..." : "Refetch" }}
        </button>
        <p v-if="isError" class="text-sm text-red-700">Could not load users. Is the API running?</p>
        <ul v-else-if="data?.length" class="space-y-2">
          <li v-for="user in data" :key="user.id" class="rounded-md border border-stone-200 p-3">
            {{ user.name }}
          </li>
        </ul>
        <p v-else class="text-sm text-stone-600">
          No users yet. The starter intentionally ships without seed data.
        </p>
      </section>
    </section>
  </main>
</template>
