<template>
  <main class="glass-container relative">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-700">IP Adrese</h1>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" @click="addEntry">Dodaj</AppButton>

        <AppButton variant="secondary" @click="exportToXlsx">Izvezi XLSX</AppButton>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
      <input
        v-model="search"
        @input="page = 1"
        type="text"
        placeholder="Pretraga..."
        class="app-input sm:w-1/2"
      />

      <div class="w-full sm:w-auto flex items-center gap-2">
        <select v-model="status" class="app-input py-2 text-sm" :title="'Filter statusa'">
          <option value="all">Svi</option>
          <option value="online">Samo online</option>
          <option value="offline">Samo offline</option>
        </select>

        <select v-model="sortBy" class="app-input py-2 text-sm">
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <button
          @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-3 py-2 border rounded-lg text-sm hover:bg-slate-50"
          :title="sortOrder === 'asc' ? 'Rastuće' : 'Opadajuće'"
        >
          {{ sortOrder === 'asc' ? '↑ Rastuće' : '↓ Opadajuće' }}
        </button>
      </div>

      <div class="flex flex-col items-start sm:items-end gap-1">
        <div class="flex items-center gap-3 text-sm">
          <span
            class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
          >
            <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Online:
            {{ counts.online }}
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs bg-rose-50 text-rose-700 border-rose-200"
          >
            <span class="h-2 w-2 rounded-full bg-rose-500"></span> Offline: {{ counts.offline }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="prevPage"
            :disabled="page === 1"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
          >
            ⬅️
          </button>
          <span>Strana {{ currentPageDisplay }} / {{ totalPages }}</span>
          <button
            @click="nextPage({ total })"
            :disabled="page * limit >= total"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
          >
            ➡️
          </button>
        </div>
        <p class="text-sm text-gray-600">Prikazano {{ entries.length }} od {{ total }} unosa</p>
      </div>
    </div>

    <div
      v-if="duplicateTotalGroups > 0"
      class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 flex items-start justify-between gap-3"
      role="alert"
    >
      <div class="text-sm">
        Pronađeno je
        <b>{{ duplicateTotalGroups }}</b> duplih imena računara (ukupno
        <b>{{ duplicateTotalRows }}</b> zapisa).
      </div>
      <div class="shrink-0">
        <button
          @click="showDupesModal = true"
          class="text-sm bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700"
        >
          Pogledaj detalje
        </button>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <article
        v-for="entry in entries"
        :key="entry.id"
        class="rounded-xl border bg-white/90 shadow-sm hover:shadow-md transition p-4 flex flex-col"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm text-slate-500">IP adresa</div>
            <div class="text-lg font-semibold tracking-tight">
              {{ entry.ip }}
            </div>

            <div class="mt-1 text-xs text-slate-500">
              {{ entry.computerName || '—' }}
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span
              v-if="entry.department"
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-slate-50 text-slate-700"
              title="Odeljenje"
            >
              {{ entry.department }}
            </span>

            <span
              class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              :class="
                entry.isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              "
              :title="statusTooltip(entry)"
            >
              <span
                class="h-2 w-2 rounded-full"
                :class="entry.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'"
              ></span>
              {{ entry.isOnline ? 'Online' : 'Offline' }}
            </span>

            <button
              @click="copyToClipboard(entry.ip, `IP ${entry.ip} kopiran!`)"
              class="text-blue-600 text-sm hover:underline"
              title="Kopiraj IP"
            >
              📋
            </button>
          </div>
        </div>

        <div class="mt-3 space-y-1.5 text-sm">
          <div class="grid grid-cols-2 gap-2 pt-2">
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">RDP App</div>
              <div class="text-sm font-medium break-all">{{ entry.rdpApp || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">Sistem</div>
              <div class="text-sm font-medium break-all">{{ entry.os || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">Remote skripta?</div>
              <div class="text-sm font-medium break-all">{{ entry.remoteScript || '—' }}</div>
            </div>
          </div>
        </div>

        <!-- ✅ OPIS / DESCRIPTION -->
        <div v-if="entry.description" class="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <div class="text-xs text-slate-500 mb-1">Opis</div>

          <p
            class="text-sm text-slate-800 whitespace-pre-wrap break-words"
            :class="expandedDesc[entry.id] ? '' : 'line-clamp-3'"
          >
            {{ entry.description }}
          </p>

          <button
            v-if="entry.description.length > 140"
            @click="toggleDesc(entry.id)"
            class="mt-1 text-xs text-blue-600 hover:underline"
            type="button"
          >
            {{ expandedDesc[entry.id] ? 'Sakrij' : 'Prikaži više' }}
          </button>
        </div>

        <div class="mt-2 text-[11px] text-slate-500">
          Poslednja provera: {{ fmtRelative(entry.lastChecked) }} • Promena statusa:
          {{ fmtRelative(entry.lastStatusChange) }}
        </div>

        <div class="mt-4 pt-3 border-t flex flex-wrap items-center gap-3">
          <button @click="editEntry(entry)" class="text-blue-600 hover:underline text-sm">
            Izmeni
          </button>
          <button @click="deleteEntry(entry.id)" class="text-red-600 hover:underline text-sm">
            Obriši
          </button>
          <button @click="openMetadata(entry)" class="text-indigo-600 hover:underline text-sm">
            Meta
          </button>
          <button @click="openPdsu(entry)" class="text-purple-600 hover:underline text-sm">
            PDSU
          </button>
          <button @click="openPortScan(entry)" class="text-teal-600 hover:underline text-sm">
            Port scan
          </button>
        </div>
      </article>
    </div>

    <ToastNotification :message="toast" />

    <ConfirmDialog
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />

    <SlideOverPanel :open="showMeta" @close="closeMetadata">
      <template #title>
        Metapodaci — {{ metaEntry?.computerName || metaEntry?.ip || 'Nepoznato' }}
      </template>
      <div v-if="metaLoading" class="text-gray-600">Učitavanje…</div>
      <div v-else-if="metaError" class="text-red-600">{{ metaError }}</div>
      <div v-else-if="!meta" class="text-gray-600">Nema metapodataka za ovu IP adresu.</div>

      <div v-else class="space-y-6">
        <div class="rounded-lg border p-4 bg-slate-50">
          <div class="flex flex-col gap-1">
            <div><span class="font-semibold">Računar:</span> {{ safe(meta.ComputerName) }}</div>
            <div><span class="font-semibold">Korisnik:</span> {{ safe(meta.UserName) }}</div>
            <div>
              <span class="font-semibold">Prikupljeno:</span>
              {{ fmtDate(meta.CollectedAt) }}
            </div>
            <div class="text-xs text-gray-500 mt-1">
              Last update: {{ fmtDate(meta.updatedAt) }} • Created:
              {{ fmtDate(meta.createdAt) }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4">
          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">Operativni sistem</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-gray-500">Caption</div>
              <div>{{ safe(meta.OS?.Caption) }}</div>
              <div class="text-gray-500">Verzija</div>
              <div>{{ safe(meta.OS?.Version) }}</div>
              <div class="text-gray-500">Build</div>
              <div>{{ safe(meta.OS?.Build) }}</div>
              <div class="text-gray-500">Install date</div>
              <div>{{ fmtDate(meta.OS?.InstallDate) }}</div>
            </div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">Sistem</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-gray-500">Proizvođač</div>
              <div>{{ safe(meta.System?.Manufacturer) }}</div>
              <div class="text-gray-500">Model</div>
              <div>{{ safe(meta.System?.Model) }}</div>
              <div class="text-gray-500">RAM ukupno</div>
              <div>{{ fmtGb(meta.System?.TotalRAM_GB) }}</div>
            </div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">CPU</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-gray-500">Naziv</div>
              <div>{{ safe(meta.CPU?.Name) }}</div>
              <div class="text-gray-500">Jezgra</div>
              <div>{{ safe(meta.CPU?.Cores) }}</div>
              <div class="text-gray-500">Logičkih</div>
              <div>{{ safe(meta.CPU?.LogicalCPUs) }}</div>
              <div class="text-gray-500">Max MHz</div>
              <div>{{ safe(meta.CPU?.MaxClockMHz) }}</div>
              <div class="text-gray-500">Socket</div>
              <div>{{ safe(meta.CPU?.Socket) }}</div>
            </div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">RAM moduli ({{ meta.RAMModules?.length || 0 }})</h4>
            <div v-if="meta.RAMModules?.length" class="space-y-2">
              <div
                v-for="(r, idx) in meta.RAMModules"
                :key="idx"
                class="border rounded p-3 bg-white"
              >
                <div class="text-sm">
                  <span class="text-gray-500">Slot:</span> {{ safe(r.Slot) }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Mfr/PN:</span>
                  {{ [r.Manufacturer, r.PartNumber].filter(Boolean).join(' · ') || '—' }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Serijski:</span> {{ safe(r.Serial) }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Kapacitet:</span> {{ fmtGb(r.CapacityGB) }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Brzina:</span> {{ safe(r.SpeedMTps) }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Form factor:</span> {{ safe(r.FormFactor) }}
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500">Nema podataka.</div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">Diskovi ({{ meta.Storage?.length || 0 }})</h4>
            <div v-if="meta.Storage?.length" class="space-y-2">
              <div v-for="(s, idx) in meta.Storage" :key="idx" class="border rounded p-3 bg-white">
                <div class="text-sm">
                  <span class="text-gray-500">Model:</span> {{ safe(s.Model) }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Serijski/FW:</span>
                  {{ [s.Serial, s.Firmware].filter(Boolean).join(' · ') || '—' }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Veličina:</span>
                  {{ s.SizeGB ? `${s.SizeGB} GB` : '—' }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Tip/BUS:</span>
                  {{ [s.MediaType, s.BusType].filter(Boolean).join(' · ') || '—' }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">DeviceID:</span> {{ safe(s.DeviceID) }}
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500">Nema podataka.</div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">GPU ({{ meta.GPUs?.length || 0 }})</h4>
            <div v-if="meta.GPUs?.length" class="space-y-2">
              <div v-for="(g, idx) in meta.GPUs" :key="idx" class="border rounded p-3 bg-white">
                <div class="text-sm">
                  <span class="text-gray-500">Naziv:</span> {{ safe(g.Name) }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">Driver:</span> {{ safe(g.DriverVers) }}
                </div>
                <div class="text-sm">
                  <span class="text-gray-500">VRAM:</span>
                  {{ g.VRAM_GB ? `${g.VRAM_GB} GB` : '—' }}
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500">Nema podataka.</div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">Mreža ({{ meta.NICs?.length || 0 }})</h4>
            <div v-if="meta.NICs?.length" class="space-y-2">
              <div v-for="(n, idx) in meta.NICs" :key="idx" class="border rounded p-3 bg-white">
                <div class="text-sm">
                  <span class="text-gray-500">Naziv:</span> {{ safe(n.Name) }}
                </div>
                <div class="text-sm"><span class="text-gray-500">MAC:</span> {{ safe(n.MAC) }}</div>
                <div class="text-sm">
                  <span class="text-gray-500">Brzina:</span> {{ fmtMbps(n.SpeedMbps) }}
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500">Nema podataka.</div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">BIOS / Matična</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-gray-500">BIOS Vendor</div>
              <div>{{ safe(meta.BIOS?.Vendor) }}</div>
              <div class="text-gray-500">BIOS Ver.</div>
              <div>{{ safe(meta.BIOS?.Version) }}</div>
              <div class="text-gray-500">BIOS Release</div>
              <div>{{ fmtDate(meta.BIOS?.ReleaseDate) }}</div>
              <div class="text-gray-500">MB Proizvođač</div>
              <div>{{ safe(meta.Motherboard?.Manufacturer) }}</div>
              <div class="text-gray-500">MB Model</div>
              <div>{{ safe(meta.Motherboard?.Product) }}</div>
              <div class="text-gray-500">MB Serijski</div>
              <div>{{ safe(meta.Motherboard?.Serial) }}</div>
            </div>
          </section>
        </div>
      </div>
    </SlideOverPanel>

    <SlideOverPanel :open="showPdsu" @close="closePdsu">
      <template #title>
        Inventar —
        {{ psduEntry?.computerName || psduEntry?.computer_name || psduEntry?.ip || 'Nepoznato' }}
      </template>

      <div class="space-y-4">
        <div class="flex flex-wrap gap-2 border-b pb-3">
          <button
            type="button"
            @click="selectPsduTab('software')"
            class="px-3 py-2 rounded-md text-sm font-medium transition"
            :class="
              psduTab === 'software'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            "
          >
            Softver
            <span v-if="pdsuLoaded.software" class="ml-1"> ({{ pdsuSoftware.length }}) </span>
          </button>

          <button
            type="button"
            @click="selectPsduTab('drivers')"
            class="px-3 py-2 rounded-md text-sm font-medium transition"
            :class="
              psduTab === 'drivers'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            "
          >
            Drajveri
            <span v-if="pdsuLoaded.drivers" class="ml-1"> ({{ pdsuDrivers.length }}) </span>
          </button>

          <button
            type="button"
            @click="selectPsduTab('services')"
            class="px-3 py-2 rounded-md text-sm font-medium transition"
            :class="
              psduTab === 'services'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            "
          >
            Servisi
            <span v-if="pdsuLoaded.services" class="ml-1"> ({{ pdsuServices.length }}) </span>
          </button>

          <button
            type="button"
            @click="selectPsduTab('updates')"
            class="px-3 py-2 rounded-md text-sm font-medium transition"
            :class="
              psduTab === 'updates'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            "
          >
            Ažuriranja
            <span v-if="pdsuLoaded.updates" class="ml-1"> ({{ pdsuUpdates.length }}) </span>
          </button>
        </div>

        <div class="relative">
          <input
            v-model="pdsuSearch"
            type="text"
            :placeholder="
              psduTab === 'software'
                ? 'Pretraži softver, verziju ili izdavača...'
                : psduTab === 'drivers'
                ? 'Pretraži uređaj, drajver ili proizvođača...'
                : psduTab === 'services'
                ? 'Pretraži servis, status ili putanju...'
                : 'Pretraži KB, opis ili korisnika...'
            "
            class="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />

          <button
            v-if="pdsuSearch"
            type="button"
            @click="pdsuSearch = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            title="Obriši pretragu"
          >
            ✕
          </button>
        </div>

        <div v-if="pdsuSearch" class="text-xs text-slate-500">
          Pronađeno:
          <template v-if="psduTab === 'software'">
            {{ filteredPdsuSoftware.length }} od {{ pdsuSoftware.length }}
          </template>

          <template v-else-if="psduTab === 'drivers'">
            {{ filteredPdsuDrivers.length }} od {{ pdsuDrivers.length }}
          </template>

          <template v-else-if="psduTab === 'services'">
            {{ filteredPdsuServices.length }} od {{ pdsuServices.length }}
          </template>

          <template v-else> {{ filteredPdsuUpdates.length }} od {{ pdsuUpdates.length }} </template>
        </div>

        <div v-if="psduLoading" class="text-slate-600">Učitavanje inventara…</div>

        <div
          v-else-if="pdsuError"
          class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
        >
          {{ pdsuError }}
        </div>

        <div v-else>
          <div v-if="psduTab === 'software'">
            <div v-if="filteredPdsuSoftware.length === 0" class="text-slate-500">
              Nema podataka o instaliranom softveru.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="item in filteredPdsuSoftware"
                :key="item.id"
                class="rounded-lg border bg-white p-3"
              >
                <div class="font-medium text-slate-800">
                  {{ item.display_name || 'Nepoznat program' }}
                </div>

                <div class="mt-1 text-sm text-slate-600">
                  Verzija: {{ item.display_version || '—' }}
                </div>

                <div class="text-sm text-slate-600">Izdavač: {{ item.publisher || '—' }}</div>

                <div class="text-sm text-slate-600">
                  Instalirano: {{ fmtDate(item.install_date) }}
                </div>

                <div class="mt-1 text-xs text-slate-400">
                  Inventar: {{ fmtDate(item.inventory_date) }}
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="psduTab === 'drivers'">
            <div v-if="filteredPdsuDrivers.length === 0" class="text-slate-500">
              Nema podataka o drajverima.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="item in filteredPdsuDrivers"
                :key="item.id"
                class="rounded-lg border bg-white p-3"
              >
                <div class="font-medium text-slate-800">
                  {{ item.device_name || 'Nepoznat uređaj' }}
                </div>

                <div class="mt-1 text-sm text-slate-600">
                  Verzija: {{ item.driver_version || '—' }}
                </div>

                <div class="text-sm text-slate-600">
                  Datum drajvera: {{ fmtDate(item.driver_date) }}
                </div>

                <div class="text-sm text-slate-600">Proizvođač: {{ item.manufacturer || '—' }}</div>

                <div class="text-sm text-slate-600">
                  Provider: {{ item.driver_provider_name || '—' }}
                </div>

                <div class="mt-1 text-xs text-slate-400">
                  Inventar: {{ fmtDate(item.inventory_date) }}
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="psduTab === 'services'">
            <div v-if="filteredPdsuServices.length === 0" class="text-slate-500">
              Nema podataka o servisima.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="item in filteredPdsuServices"
                :key="item.id"
                class="rounded-lg border bg-white p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="font-medium text-slate-800">
                      {{ item.display_name || item.name || 'Nepoznat servis' }}
                    </div>

                    <div class="text-xs text-slate-500">
                      {{ item.name || '—' }}
                    </div>
                  </div>

                  <span
                    class="rounded-full border px-2 py-0.5 text-xs"
                    :class="
                      item.state === 'Running'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    "
                  >
                    {{ item.state || 'Nepoznato' }}
                  </span>
                </div>

                <div class="mt-2 text-sm text-slate-600">
                  Start mode: {{ item.start_mode || '—' }}
                </div>

                <div class="text-sm text-slate-600">Korisnik: {{ item.start_name || '—' }}</div>

                <div class="mt-1 break-all text-xs text-slate-500">
                  {{ item.path_name || '—' }}
                </div>

                <div class="mt-1 text-xs text-slate-400">
                  Inventar: {{ fmtDate(item.inventory_date) }}
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="psduTab === 'updates'">
            <div v-if="filteredPdsuUpdates.length === 0" class="text-slate-500">
              Nema podataka o Windows ažuriranjima.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="item in filteredPdsuUpdates"
                :key="item.id"
                class="rounded-lg border bg-white p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="font-medium text-slate-800">
                    {{ item.hotfix_id || 'Nepoznat KB' }}
                  </div>

                  <div class="text-xs text-slate-500">
                    {{ fmtDate(item.installed_on) }}
                  </div>
                </div>

                <div class="mt-1 text-sm text-slate-600">
                  {{ item.description || '—' }}
                </div>

                <div class="mt-1 text-sm text-slate-600">
                  Instalirao: {{ item.installed_by || '—' }}
                </div>

                <div class="mt-1 text-xs text-slate-400">
                  Inventar: {{ fmtDate(item.inventory_date) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SlideOverPanel>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showDupesModal"
          class="fixed inset-0 z-[9996] flex items-center justify-center bg-black/50"
          @click.self="showDupesModal = false"
          role="dialog"
          aria-modal="true"
        >
          <div class="bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-semibold">Duplirana imena računara</h2>
              <button
                @click="showDupesModal = false"
                class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                aria-label="Zatvori"
              >
                &times;
              </button>
            </div>

            <div v-if="duplicateGroups.length === 0" class="text-gray-600">
              Nema duplih imena u trenutnom prikazu.
            </div>

            <div v-else class="space-y-3 max-h-[60vh] overflow-y-auto">
              <div
                v-for="g in duplicateGroups"
                :key="g.key || g.name"
                class="rounded border bg-slate-50 p-3"
              >
                <div class="flex items-center justify-between">
                  <div class="font-medium">
                    {{ g.name }} <span class="text-xs text-slate-500">({{ g.count }} kom)</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                      @click="
                        () => {
                          search = g.name
                          page = 1
                          showDupesModal = false
                        }
                      "
                      title="Filtriraj na ovo ime (search)"
                    >
                      Filtriraj
                    </button>
                    <button
                      class="text-xs px-2 py-1 rounded border"
                      @click="copyToClipboard(g.name, `Ime '${g.name}' kopirano!`)"
                    >
                      Kopiraj ime
                    </button>
                  </div>
                </div>

                <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    v-for="it in g.items"
                    :key="it.id"
                    class="bg-white rounded border p-2 text-sm flex items-center justify-between gap-2"
                  >
                    <div class="min-w-0">
                      <div class="font-medium truncate">{{ it.ip }}</div>
                      <div class="text-xs text-slate-500 truncate">
                        {{ it.department || '—' }}
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <button
                        class="text-xs text-blue-600 hover:underline"
                        @click="router.push(`/edit/${it.id}`)"
                        title="Otvori za izmenu"
                      >
                        Izmeni
                      </button>
                      <button
                        class="text-xs"
                        @click="copyToClipboard(it.ip, `IP ${it.ip} kopiran!`)"
                        title="Kopiraj IP"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="duplicateGroups.length" class="mt-3 text-xs text-slate-500">
              Savet: U idealnom slučaju svaka mašina ima jedinstveno ime (npr. standardizovan
              prefiks i inventarski broj). Ove grupe pomažu da brzo uočite konfliktne nazive.
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showPortScan"
          class="fixed inset-0 z-[9996] flex"
          @click.self="closePortScan"
          role="dialog"
          aria-modal="true"
        >
          <div class="absolute inset-0 bg-black/40"></div>

          <div
            class="relative ml-auto h-full w-full sm:w-[720px] bg-white shadow-xl overflow-y-auto"
          >
            <div
              class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between"
            >
              <h3 class="text-lg font-semibold">Port scan — {{ portScanTarget?.ip }}</h3>
              <button
                @click="closePortScan"
                class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                aria-label="Zatvori"
              >
                &times;
              </button>
            </div>

            <div class="p-4 space-y-4">
              <div class="rounded border p-3 bg-slate-50">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label class="text-xs text-slate-500"
                      >Custom portovi (npr: 22,80,443 ili 20-25,80)</label
                    >
                    <input
                      v-model="portScanPorts"
                      class="w-full border px-3 py-2 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="prazno = podrazumevana lista"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-slate-500">Timeout po portu (ms)</label>
                    <input
                      v-model.number="portScanTimeoutMs"
                      type="number"
                      min="200"
                      max="5000"
                      class="w-full border px-3 py-2 rounded shadow-sm"
                    />
                  </div>
                  <div class="flex gap-2">
                    <button
                      @click="runPortScan"
                      :disabled="portScanLoading"
                      class="px-4 py-2 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      Pokreni sken
                    </button>
                    <button
                      v-if="portScanResult"
                      @click="
                        copyToClipboard(
                          JSON.stringify(portScanResult.open, null, 2),
                          'Rezultat kopiran!'
                        )
                      "
                      class="px-3 py-2 rounded border"
                    >
                      Kopiraj JSON
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="portScanLoading" class="text-gray-600">Skeniram…</div>
              <div v-else-if="portScanError" class="text-red-600">{{ portScanError }}</div>

              <div v-else-if="portScanResult">
                <div class="text-sm text-slate-600 mb-2">
                  Otvoreni: <b>{{ portScanResult.openCount }}</b> / Skenirano:
                  {{ portScanResult.scanned }}
                </div>

                <div v-if="portScanResult.openCount === 0" class="text-gray-600">
                  Nije pronađen nijedan otvoren TCP port (za zadate uslove).
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="p in portScanResult.open"
                    :key="p.port"
                    class="rounded border p-3 bg-white"
                  >
                    <div class="flex items-center justify-between">
                      <div class="font-medium">
                        Port {{ p.port }} / {{ p.protocol?.toUpperCase() || 'TCP' }}
                      </div>
                      <div class="text-xs text-slate-500">~{{ p.rttMs }} ms</div>
                    </div>
                    <div class="text-sm">
                      <div>
                        <span class="text-slate-500">Servis:</span>
                        {{ p.serviceHint || 'nepoznat' }}
                      </div>
                      <div v-if="p.banner">
                        <span class="text-slate-500">Baner:</span>
                        <code class="text-xs break-all">{{ p.banner }}</code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="text-xs text-slate-500">
                Napomena: Ovo je brzi TCP connect sken (ne radi UDP). Neki servisi ne šalju baner
                iako je port otvoren.
              </div>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </main>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate, fmtRelative, fmtGb, fmtMbps, safe } from '@/utils/format.js'
import { downloadFromResponse } from '@/utils/download.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'

const showPdsu = ref(false)
const psduEntry = ref(null)

const psduTab = ref('software')

const psduLoading = ref(false)
const pdsuError = ref(null)

const pdsuSoftware = ref([])
const pdsuDrivers = ref([])
const pdsuServices = ref([])
const pdsuUpdates = ref([])

const pdsuLoaded = ref({
  software: false,
  drivers: false,
  services: false,
  updates: false,
})

const pdsuSearch = ref('')

const router = useRouter()
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const { page, limit, search, sortBy, sortOrder, status, nextPage, prevPage } = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 10 },
    search: { type: 'string', default: '' },
    sortBy: { type: 'string', default: 'ip' },
    sortOrder: { type: 'string', default: 'asc' },
    status: { type: 'string', default: 'all', oneOf: ['all', 'online', 'offline'] },
  },
  resetPageOn: ['sortBy', 'sortOrder', 'status'],
})

watch([page, limit, search, sortBy, sortOrder, status], fetchData, { immediate: true })

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const counts = ref({ online: 0, offline: 0 })
const currentPageDisplay = computed(() => (totalPages.value === 0 ? '0' : page.value))

const showMeta = ref(false)
const metaLoading = ref(false)
const metaError = ref(null)
const metaEntry = ref(null)
const meta = ref(null)

const expandedDesc = ref({}) // ✅ novo: state za expand opisa

const sortOptions = [
  { value: 'ip', label: 'IP adresa' },
  { value: 'computerName', label: 'Ime računara' },
  { value: 'department', label: 'Odeljenje' },
  { value: 'rdpApp', label: 'RDP App' },
  { value: 'os', label: 'Sistem' },
  { value: 'remoteScript', label: 'Remote skripta?' },
]

const addEntry = () => router.push('/add')
const editEntry = (entry) => router.push(`/edit/${entry.id}`)

const toggleDesc = (id) => {
  expandedDesc.value[id] = !expandedDesc.value[id]
}

async function fetchData() {
  const params = new URLSearchParams({
    page: page.value,
    limit: limit.value,
    search: search.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    status: status.value,
  })

  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses?${params.toString()}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    entries.value = data.entries
    total.value = data.total
    totalPages.value = data.totalPages
    counts.value = data.counts || { online: 0, offline: 0 }

    // ✅ opcionalno: očisti expand state za obrisane/skrivene entry-je
    const next = {}
    for (const e of entries.value) next[e.id] = !!expandedDesc.value[e.id]
    expandedDesc.value = next
  } catch (err) {
    console.error('Neuspešno dohvatanje podataka')
  }
}

// =========================
// Inventory
// =========================

async function openPdsu(entry) {
  psduEntry.value = entry
  psduTab.value = 'software'
  pdsuError.value = null

  pdsuSoftware.value = []
  pdsuDrivers.value = []
  pdsuServices.value = []
  pdsuUpdates.value = []

  pdsuLoaded.value = {
    software: false,
    drivers: false,
    services: false,
    updates: false,
  }

  showPdsu.value = true

  pdsuSearch.value = ''

  await loadPsduTab('software')
}

function closePdsu() {
  showPdsu.value = false
  psduEntry.value = null
  psduTab.value = 'software'
  pdsuError.value = null
  psduLoading.value = false

  pdsuSoftware.value = []
  pdsuDrivers.value = []
  pdsuServices.value = []
  pdsuUpdates.value = []

  pdsuLoaded.value = {
    software: false,
    drivers: false,
    services: false,
    updates: false,
  }

  pdsuSearch.value = ''
}

async function loadPsduTab(tab) {
  if (!psduEntry.value?.id) return

  psduTab.value = tab

  if (pdsuLoaded.value[tab]) {
    return
  }

  psduLoading.value = true
  pdsuError.value = null

  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${psduEntry.value.id}/${tab}`)

    if (!res.ok) {
      throw new Error(await parseError(res, `Greška pri učitavanju inventara. HTTP ${res.status}`))
    }

    const data = await res.json()
    const rows = Array.isArray(data) ? data : []

    if (tab === 'software') {
      pdsuSoftware.value = rows
    } else if (tab === 'drivers') {
      pdsuDrivers.value = rows
    } else if (tab === 'services') {
      pdsuServices.value = rows
    } else if (tab === 'updates') {
      pdsuUpdates.value = rows
    }

    pdsuLoaded.value[tab] = true
  } catch (error) {
    console.error('Greška pri učitavanju inventara:', error)

    pdsuError.value = error?.message || 'Neuspešno učitavanje inventara.'
  } finally {
    psduLoading.value = false
  }
}

async function selectPsduTab(tab) {
  pdsuSearch.value = ''
  await loadPsduTab(tab)
}

const filteredPdsuSoftware = computed(() => {
  const q = pdsuSearch.value.trim().toLowerCase()

  if (!q) return pdsuSoftware.value

  return pdsuSoftware.value.filter((item) =>
    [item.display_name, item.display_version, item.publisher, item.install_date].some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(q)
    )
  )
})

const filteredPdsuDrivers = computed(() => {
  const q = pdsuSearch.value.trim().toLowerCase()

  if (!q) return pdsuDrivers.value

  return pdsuDrivers.value.filter((item) =>
    [
      item.device_name,
      item.driver_version,
      item.driver_date,
      item.manufacturer,
      item.driver_provider_name,
    ].some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(q)
    )
  )
})

const filteredPdsuServices = computed(() => {
  const q = pdsuSearch.value.trim().toLowerCase()

  if (!q) return pdsuServices.value

  return pdsuServices.value.filter((item) =>
    [
      item.name,
      item.display_name,
      item.state,
      item.start_mode,
      item.start_name,
      item.path_name,
    ].some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(q)
    )
  )
})

const filteredPdsuUpdates = computed(() => {
  const q = pdsuSearch.value.trim().toLowerCase()

  if (!q) return pdsuUpdates.value

  return pdsuUpdates.value.filter((item) =>
    [item.description, item.hotfix_id, item.installed_on, item.installed_by].some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(q)
    )
  )
})

const deleteEntry = async (id) => {
  const ok = await askConfirm('Da li si siguran da želiš da obrišeš ovaj unos?', {
    title: 'Brisanje unosa',
  })
  if (!ok) return

  const res = await fetchWithAuth(`/api/protected/ip-addresses/${id}`, { method: 'DELETE' })
  if (res.ok) {
    fetchData()
  } else {
    showToast('Greška pri brisanju unosa', { prefix: '❌ ', duration: 3000 })
  }
}

const exportToXlsx = async () => {
  try {
    await downloadFromResponse(
      await fetchWithAuth(
        `/api/protected/ip-addresses/export-xlsx?search=${encodeURIComponent(search.value)}`
      ),
      'ip-entries.xlsx'
    )
  } catch {
    console.log('Greška pri izvozu XLSX-a')
  }
}

const statusTooltip = (e) => {
  const onlineTxt = e.isOnline ? 'Online' : 'Offline'
  const lc = e.lastChecked ? new Date(e.lastChecked).toLocaleString() : '—'
  const lsc = e.lastStatusChange ? new Date(e.lastStatusChange).toLocaleString() : '—'
  return `${onlineTxt}\nPoslednja provera: ${lc}\nPromena statusa: ${lsc}`
}

const openMetadata = async (entry) => {
  metaLoading.value = true
  metaError.value = null
  metaEntry.value = entry
  meta.value = null
  showMeta.value = true
  try {
    const res = await fetchWithAuth(
      `/api/protected/ip-addresses/${encodeURIComponent(entry.ip)}/metadata`
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    meta.value = data?.metadata ?? data
  } catch (e) {
    console.error(e)
    metaError.value = 'Neuspešno učitavanje metapodataka.'
  } finally {
    metaLoading.value = false
  }
}
const closeMetadata = () => {
  showMeta.value = false
  meta.value = null
  metaEntry.value = null
  metaError.value = null
}

const duplicateGroups = ref([])
const duplicateTotalGroups = ref(0)
const duplicateTotalRows = ref(0)
const showDupesModal = ref(false)

async function fetchDuplicateNames() {
  try {
    const params = new URLSearchParams({
      search: search.value,
      status: status.value,
    })
    const res = await fetchWithAuth(`/api/protected/ip-addresses/duplicates?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    duplicateGroups.value = Array.isArray(data.groups) ? data.groups : []
    duplicateTotalGroups.value = data.totalDuplicateGroups || 0
    duplicateTotalRows.value = data.totalDuplicateRows || 0
  } catch (e) {
    console.error('Neuspešno dohvatanje duplikata:', e)
    duplicateGroups.value = []
    duplicateTotalGroups.value = 0
    duplicateTotalRows.value = 0
  }
}

const showPortScan = ref(false)
const portScanTarget = ref(null)
const portScanLoading = ref(false)
const portScanError = ref(null)
const portScanResult = ref(null)
const portScanPorts = ref('')
const portScanTimeoutMs = ref(100)

function openPortScan(entry) {
  portScanTarget.value = entry
  portScanResult.value = null
  portScanError.value = null
  portScanPorts.value = ''
  showPortScan.value = true
}

function closePortScan() {
  showPortScan.value = false
  portScanTarget.value = null
  portScanResult.value = null
  portScanError.value = null
}

async function runPortScan() {
  if (!portScanTarget.value) return
  portScanLoading.value = true
  portScanError.value = null
  portScanResult.value = null
  try {
    const params = new URLSearchParams({
      ip: portScanTarget.value.ip,
      timeoutMs: String(portScanTimeoutMs.value || 1200),
    })
    if (portScanPorts.value.trim()) params.set('ports', portScanPorts.value.trim())

    const res = await fetchWithAuth(`/api/protected/ip-addresses/scan-ports?${params.toString()}`)
    if (!res.ok) {
      throw new Error(await parseError(res, `HTTP ${res.status}`))
    }
    const data = await res.json()
    portScanResult.value = data
  } catch (e) {
    portScanError.value = e?.message || 'Greška pri skeniranju'
  } finally {
    portScanLoading.value = false
  }
}

const AUTO_REFRESH_SEC = 30
let refreshTimer = null
onMounted(() => {
  refreshTimer = setInterval(() => {
    fetchData()
  }, AUTO_REFRESH_SEC * 1000)
  fetchDuplicateNames()
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
/* fallback ako nemaš tailwind line-clamp plugin */
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
