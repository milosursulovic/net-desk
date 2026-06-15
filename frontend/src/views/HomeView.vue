<template>
  <main class="glass-container relative">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-700">IP Adrese</h1>

      <div class="flex flex-wrap items-center gap-2">
        <button @click="addEntry"
          class="bg-emerald-600 text-white px-4 py-2 rounded-md shadow hover:bg-emerald-700 font-semibold transition">
          Dodaj
        </button>

        <button @click="exportToXlsx"
          class="bg-blue-600 text-white px-4 py-2 rounded-md shadow hover:bg-blue-700 font-semibold transition">
          Izvezi XLSX
        </button>

        <RouterLink to="/metadata"
          class="bg-gray-700 text-white px-4 py-2 rounded-md shadow hover:bg-gray-800 inline-flex items-center font-medium transition">
          Metapodaci
        </RouterLink>

        <RouterLink to="/printers"
          class="bg-orange-600 text-white px-4 py-2 rounded-md shadow hover:bg-orange-700 inline-flex items-center font-medium transition">
          Štampači
        </RouterLink>

        <RouterLink to="/inventory"
          class="bg-purple-600 text-white px-4 py-2 rounded-md shadow hover:bg-purple-700 inline-flex items-center font-medium transition">
          Inventar
        </RouterLink>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
      <input v-model="search" @input="page = 1" type="text" placeholder="Pretraga..."
        class="border border-gray-300 px-3 py-2 rounded w-full sm:w-1/2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />

      <div class="w-full sm:w-auto flex items-center gap-2">
        <select v-model="status" class="border px-2 py-2 rounded text-sm" :title="'Filter statusa'">
          <option value="all">Svi</option>
          <option value="online">Samo online</option>
          <option value="offline">Samo offline</option>
        </select>

        <select v-model="sortBy" class="border px-2 py-2 rounded text-sm">
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <button @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'" class="px-3 py-2 border rounded text-sm"
          :title="sortOrder === 'asc' ? 'Rastuće' : 'Opadajuće'">
          {{ sortOrder === 'asc' ? '↑ Rastuće' : '↓ Opadajuće' }}
        </button>
      </div>

      <div class="flex flex-col items-start sm:items-end gap-1">
        <div class="flex items-center gap-3 text-sm">
          <span
            class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
            <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Online:
            {{ counts.online }}
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs bg-rose-50 text-rose-700 border-rose-200">
            <span class="h-2 w-2 rounded-full bg-rose-500"></span> Offline: {{ counts.offline }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button @click="prevPage" :disabled="page === 1" class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50">
            ⬅️
          </button>
          <span>Strana {{ currentPageDisplay }} / {{ totalPages }}</span>
          <button @click="nextPage({ total })" :disabled="page * limit >= total"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50">
            ➡️
          </button>
        </div>
        <p class="text-sm text-gray-600">Prikazano {{ entries.length }} od {{ total }} unosa</p>
      </div>
    </div>

    <div v-if="duplicateTotalGroups > 0"
      class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 flex items-start justify-between gap-3"
      role="alert">
      <div class="text-sm">
        Pronađeno je
        <b>{{ duplicateTotalGroups }}</b> duplih imena računara (ukupno
        <b>{{ duplicateTotalRows }}</b> zapisa).
      </div>
      <div class="shrink-0">
        <button @click="showDupesModal = true"
          class="text-sm bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700">
          Pogledaj detalje
        </button>
      </div>
    </div>

    <button @click="showPasswords = !showPasswords" class="text-sm text-gray-700 underline hover:text-gray-900">
      {{ showPasswords ? 'Sakrij lozinke' : 'Prikaži lozinke' }}
    </button>

    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <article v-for="entry in entries" :key="entry.id"
        class="rounded-xl border bg-white/90 shadow-sm hover:shadow-md transition p-4 flex flex-col">
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
            <span v-if="entry.department"
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-slate-50 text-slate-700"
              title="Odeljenje">
              {{ entry.department }}
            </span>

            <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" :class="entry.isOnline
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
              " :title="statusTooltip(entry)">
              <span class="h-2 w-2 rounded-full"
                :class="entry.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'"></span>
              {{ entry.isOnline ? 'Online' : 'Offline' }}
            </span>

            <button @click="copyToClipboard(entry.ip, `IP ${entry.ip} kopiran!`)"
              class="text-blue-600 text-sm hover:underline" title="Kopiraj IP">
              📋
            </button>
          </div>
        </div>

        <div class="mt-3 space-y-1.5 text-sm">
          <div class="flex justify-between gap-3">
            <span class="text-slate-500">Korisničko ime</span>
            <span class="font-medium truncate">{{ entry.username || '—' }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-slate-500">Puno ime</span>
            <span class="font-medium truncate">{{ entry.fullName || '—' }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-slate-500">Lozinka</span>
            <span class="font-medium truncate">
              {{ showPasswords ? entry.password || '—' : '••••••' }}
            </span>
            <button v-if="showPasswords && entry.password" @click="copyToClipboard(entry.password, 'Lozinka kopirana!')"
              class="ml-2 text-blue-600 hover:underline text-xs">
              📋
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2">
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">RDP</div>
              <div class="text-sm font-medium break-all">{{ entry.rdp || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">RDP App</div>
              <div class="text-sm font-medium break-all">{{ entry.rdpApp || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">Sistem</div>
              <div class="text-sm font-medium break-all">{{ entry.os || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">Heliant Instaliran?</div>
              <div class="text-sm font-medium break-all">{{ entry.heliantInstalled || '—' }}</div>
            </div>
          </div>
        </div>

        <!-- ✅ OPIS / DESCRIPTION -->
        <div v-if="entry.description" class="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <div class="text-xs text-slate-500 mb-1">Opis</div>

          <p class="text-sm text-slate-800 whitespace-pre-wrap break-words"
            :class="expandedDesc[entry.id] ? '' : 'line-clamp-3'">
            {{ entry.description }}
          </p>

          <button v-if="entry.description.length > 140" @click="toggleDesc(entry.id)"
            class="mt-1 text-xs text-blue-600 hover:underline" type="button">
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
          <button @click="generateRdpFile(entry)" class="text-green-600 hover:underline text-sm">
            RDP
          </button>
          <button @click="openMetadata(entry)" class="text-indigo-600 hover:underline text-sm">
            Meta
          </button>
          <button @click="openPortScan(entry)" class="text-teal-600 hover:underline text-sm">
            Port scan
          </button>
        </div>
      </article>
    </div>

    <ToastNotification :message="toast" />

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
            <div>
              <span class="font-semibold">Računar:</span> {{ safe(meta.ComputerName) }}
            </div>
            <div>
              <span class="font-semibold">Korisnik:</span> {{ safe(meta.UserName) }}
            </div>
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
            <h4 class="font-semibold mb-2">
              RAM moduli ({{ meta.RAMModules?.length || 0 }})
            </h4>
            <div v-if="meta.RAMModules?.length" class="space-y-2">
              <div v-for="(r, idx) in meta.RAMModules" :key="idx" class="border rounded p-3 bg-white">
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
                <div class="text-sm">
                  <span class="text-gray-500">MAC:</span> {{ safe(n.MAC) }}
                </div>
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

    <teleport to="body">
      <transition name="fade">
        <div v-if="showDupesModal" class="fixed inset-0 z-[9996] flex items-center justify-center bg-black/50"
          @click.self="showDupesModal = false" role="dialog" aria-modal="true">
          <div class="bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-semibold">Duplirana imena računara</h2>
              <button @click="showDupesModal = false" class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                aria-label="Zatvori">
                &times;
              </button>
            </div>

            <div v-if="duplicateGroups.length === 0" class="text-gray-600">
              Nema duplih imena u trenutnom prikazu.
            </div>

            <div v-else class="space-y-3 max-h-[60vh] overflow-y-auto">
              <div v-for="g in duplicateGroups" :key="g.key || g.name" class="rounded border bg-slate-50 p-3">
                <div class="flex items-center justify-between">
                  <div class="font-medium">
                    {{ g.name }} <span class="text-xs text-slate-500">({{ g.count }} kom)</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button class="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700" @click="
                      () => {
                        search = g.name
                        page = 1
                        showDupesModal = false
                      }
                    " title="Filtriraj na ovo ime (search)">
                      Filtriraj
                    </button>
                    <button class="text-xs px-2 py-1 rounded border"
                      @click="copyToClipboard(g.name, `Ime '${g.name}' kopirano!`)">
                      Kopiraj ime
                    </button>
                  </div>
                </div>

                <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div v-for="it in g.items" :key="it.id"
                    class="bg-white rounded border p-2 text-sm flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <div class="font-medium truncate">{{ it.ip }}</div>
                      <div class="text-xs text-slate-500 truncate">
                        {{ it.username || '—' }} · {{ it.department || '—' }}
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <button class="text-xs text-blue-600 hover:underline" @click="router.push(`/edit/${it.id}`)"
                        title="Otvori za izmenu">
                        Izmeni
                      </button>
                      <button class="text-xs" @click="copyToClipboard(it.ip, `IP ${it.ip} kopiran!`)"
                        title="Kopiraj IP">
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
        <div v-if="showPortScan" class="fixed inset-0 z-[9996] flex" @click.self="closePortScan" role="dialog"
          aria-modal="true">
          <div class="absolute inset-0 bg-black/40"></div>

          <div class="relative ml-auto h-full w-full sm:w-[720px] bg-white shadow-xl overflow-y-auto">
            <div class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">Port scan — {{ portScanTarget?.ip }}</h3>
              <button @click="closePortScan" class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                aria-label="Zatvori">
                &times;
              </button>
            </div>

            <div class="p-4 space-y-4">
              <div class="rounded border p-3 bg-slate-50">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label class="text-xs text-slate-500">Custom portovi (npr: 22,80,443 ili 20-25,80)</label>
                    <input v-model="portScanPorts"
                      class="w-full border px-3 py-2 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="prazno = podrazumevana lista" />
                  </div>
                  <div>
                    <label class="text-xs text-slate-500">Timeout po portu (ms)</label>
                    <input v-model.number="portScanTimeoutMs" type="number" min="200" max="5000"
                      class="w-full border px-3 py-2 rounded shadow-sm" />
                  </div>
                  <div class="flex gap-2">
                    <button @click="runPortScan" :disabled="portScanLoading"
                      class="px-4 py-2 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">
                      Pokreni sken
                    </button>
                    <button v-if="portScanResult" @click="
                      copyToClipboard(
                        JSON.stringify(portScanResult.open, null, 2),
                        'Rezultat kopiran!'
                      )
                      " class="px-3 py-2 rounded border">
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
                  <div v-for="p in portScanResult.open" :key="p.port" class="rounded border p-3 bg-white">
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
import { useRouter, RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate, fmtRelative, fmtGb, fmtMbps, safe } from '@/utils/format.js'
import { downloadFromResponse } from '@/utils/download.js'
import { downloadRdpFile } from '@/utils/rdp.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const router = useRouter()
const { toast, copyToClipboard } = useToast()

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

watch(
  [page, limit, search, sortBy, sortOrder, status],
  fetchData,
  { immediate: true }
)

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const counts = ref({ online: 0, offline: 0 })
const currentPageDisplay = computed(() => (totalPages.value === 0 ? '0' : page.value))

const showPasswords = ref(false)

const showMeta = ref(false)
const metaLoading = ref(false)
const metaError = ref(null)
const metaEntry = ref(null)
const meta = ref(null)

const expandedDesc = ref({}) // ✅ novo: state za expand opisa

const sortOptions = [
  { value: 'ip', label: 'IP adresa' },
  { value: 'computerName', label: 'Ime računara' },
  { value: 'username', label: 'Korisničko ime' },
  { value: 'fullName', label: 'Puno ime' },
  { value: 'department', label: 'Odeljenje' },
  { value: 'rdp', label: 'RDP' },
  { value: 'rdpApp', label: 'RDP App' },
  { value: 'os', label: 'Sistem' },
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

const deleteEntry = async (id) => {
  if (!confirm('Da li si siguran da želiš da obrišeš ovaj unos?')) return
  const res = await fetchWithAuth(`/api/protected/ip-addresses/${id}`, { method: 'DELETE' })
  if (res.ok) fetchData()
}

const generateRdpFile = downloadRdpFile

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
