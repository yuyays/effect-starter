<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import UsersCard from "../components/UsersCard.vue";
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
      <UsersCard :users="data" :is-error="isError" :is-fetching="isFetching" @refetch="refetch()" />
    </section>
  </main>
</template>
