<template>
  <main class="glass-container relative">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-700">🖥️ IP Adrese</h1>

      <div class="flex flex-wrap items-center gap-2">
        <button
          @click="addEntry"
          class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700"
        >
          ➕ Dodaj
        </button>

        <button
          @click="exportToXlsx"
          class="bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700"
        >
          📤 Izvezi XLSX
        </button>

        <label
          class="inline-flex items-center bg-yellow-500 text-white px-4 py-2 rounded cursor-pointer hover:bg-yellow-600 shadow"
        >
          <input type="file" @change="handleFileUpload" accept=".csv, .xlsx" class="hidden" />
          📥 Uvezi
        </label>

        <button
          @click="showAvailableIps"
          class="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700"
        >
          📡 Slobodne IP adrese
        </button>

        <RouterLink
          to="/metadata"
          class="bg-slate-700 text-white px-4 py-2 rounded shadow hover:bg-slate-800 inline-flex items-center"
        >
          📊 Metapodaci
        </RouterLink>

        <RouterLink
          to="/printers"
          class="bg-slate-700 text-white px-4 py-2 rounded shadow hover:bg-slate-800 inline-flex items-center"
        >
          🖨️ Štampači
        </RouterLink>

        <RouterLink
          to="/domains"
          class="bg-slate-700 text-white px-4 py-2 rounded shadow hover:bg-slate-800 inline-flex items-center"
        >
          🌐 DNS logovi
        </RouterLink>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <input
        v-model="search"
        @input="page = 1"
        type="text"
        placeholder="🔎 Pretraga..."
        class="border border-gray-300 px-3 py-2 rounded w-full sm:w-1/2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      <div class="w-full sm:w-auto flex items-center gap-2">
        <select v-model="sortBy" class="border px-2 py-2 rounded text-sm">
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <button
          @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-3 py-2 border rounded text-sm"
          :title="sortOrder === 'asc' ? 'Rastuće' : 'Opadajuće'"
        >
          {{ sortOrder === 'asc' ? '↑ Rastuće' : '↓ Opadajuće' }}
        </button>
      </div>

      <div class="flex flex-col items-start sm:items-end gap-1">
        <div class="flex items-center gap-2">
          <button
            @click="prevPage"
            :disabled="page === 1"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
          >
            ⬅️
          </button>
          <span>📄 Strana {{ currentPageDisplay }} / {{ totalPages }}</span>
          <button
            @click="nextPage"
            :disabled="page * limit >= total"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
          >
            ➡️
          </button>
        </div>
        <p class="text-sm text-gray-600">Ukupno {{ entries.length }} od {{ total }} unosa</p>
      </div>
    </div>

    <button
      @click="showPasswords = !showPasswords"
      class="text-sm text-gray-700 underline hover:text-gray-900"
    >
      {{ showPasswords ? '🔒 Sakrij lozinke' : '🔓 Prikaži lozinke' }}
    </button>

    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <article
        v-for="entry in entries"
        :key="entry._id"
        class="rounded-xl border bg-white/90 shadow-sm hover:shadow-md transition p-4 flex flex-col"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm text-slate-500">IP adresa</div>
            <div class="text-lg font-semibold tracking-tight">
              <button
                class="underline decoration-dotted hover:decoration-solid hover:text-blue-700"
                @click="openDomainsForIp(entry)"
                :title="`Prikaži domene za ${entry.ip}`"
              >
                {{ entry.ip }}
              </button>
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
              🏢 {{ entry.department }}
            </span>

            <!-- Online status pill -->
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
          <div class="flex justify-between gap-3">
            <span class="text-slate-500">👤 Korisničko ime</span>
            <span class="font-medium truncate">{{ entry.username || '—' }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-slate-500">🙍‍♂️ Puno ime</span>
            <span class="font-medium truncate">{{ entry.fullName || '—' }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-slate-500">🔑 Lozinka</span>
            <span class="font-medium truncate">
              {{ showPasswords ? entry.password || '—' : '••••••' }}
            </span>
            <button
              v-if="showPasswords && entry.password"
              @click="copyToClipboard(entry.password, 'Lozinka kopirana!')"
              class="ml-2 text-blue-600 hover:underline text-xs"
            >
              📋
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2">
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">🖧 RDP</div>
              <div class="text-sm font-medium break-all">{{ entry.rdp || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">🌐 DNS Log</div>
              <div class="text-sm font-medium break-all">{{ entry.dnsLog || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">💻 AnyDesk</div>
              <div class="text-sm font-medium break-all">{{ entry.anyDesk || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">🧩 Sistem</div>
              <div class="text-sm font-medium break-all">{{ entry.system || '—' }}</div>
            </div>
          </div>
        </div>

        <!-- Mini status row -->
        <div class="mt-2 text-[11px] text-slate-500">
          ⏱️ Poslednja provera: {{ fmtRelative(entry.lastChecked) }} • Promena statusa:
          {{ fmtRelative(entry.lastStatusChange) }}
        </div>

        <div class="mt-4 pt-3 border-t flex flex-wrap items-center gap-3">
          <button @click="editEntry(entry)" class="text-blue-600 hover:underline text-sm">
            ✏️ Izmeni
          </button>
          <button @click="deleteEntry(entry._id)" class="text-red-600 hover:underline text-sm">
            🗑️ Obriši
          </button>
          <button @click="generateRdpFile(entry)" class="text-green-600 hover:underline text-sm">
            🔗 RDP
          </button>
          <button @click="openMetadata(entry)" class="text-indigo-600 hover:underline text-sm">
            ℹ️ Meta
          </button>
          <button @click="openPrinters(entry)" class="text-amber-600 hover:underline text-sm">
            🖨 Štampači
          </button>
        </div>
      </article>
    </div>

    <!-- Toast -->
    <teleport to="body">
      <transition name="fade">
        <div
          v-if="copiedText"
          class="fixed top-6 right-6 bg-gray-800 text-white px-4 py-2 rounded shadow-lg text-sm z-[9999]"
        >
          {{ copiedText }}
        </div>
      </transition>
    </teleport>

    <!-- Slobodne IP adrese modal -->
    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showingAvailableModal"
          class="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"
          @click.self="closeAvailableModal"
          role="dialog"
          aria-modal="true"
        >
          <div class="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg">
            <div class="mb-4">
              <div class="flex justify-between items-center mb-2">
                <h2 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  📡 Slobodne IP adrese
                </h2>
                <button
                  @click="closeAvailableModal"
                  class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                  aria-label="Zatvori"
                >
                  &times;
                </button>
              </div>
              <input
                v-model="ipSearch"
                type="text"
                placeholder="🔍 Pretraga IP adresa..."
                class="w-full border border-gray-300 px-3 py-2 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div v-if="availableIps.length > 0">
              <ul class="space-y-2 max-h-60 overflow-y-auto">
                <li
                  v-for="(ip, index) in filteredAvailableIps"
                  :key="index"
                  @click="goToAddWithIp(ip)"
                  class="p-2 bg-slate-100 rounded hover:bg-slate-200 transition flex justify-between items-center cursor-pointer"
                >
                  <span>{{ ip }}</span>
                  <button
                    @click.stop="copyToClipboard(ip, `IP ${ip} kopiran!`)"
                    class="text-blue-500 text-sm hover:underline"
                  >
                    📋 Kopiraj
                  </button>
                </li>
              </ul>
            </div>
            <div v-else class="text-gray-500 text-center">Nema slobodnih IP adresa.</div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- Metadata drawer -->
    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showMeta"
          class="fixed inset-0 z-[9997] flex"
          @click.self="closeMetadata"
          role="dialog"
          aria-modal="true"
        >
          <div class="absolute inset-0 bg-black/40"></div>

          <div
            class="relative ml-auto h-full w-full sm:w-[640px] bg-white shadow-xl overflow-y-auto"
          >
            <div
              class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between"
            >
              <h3 class="text-lg font-semibold">
                🧾 Metapodaci — {{ metaEntry?.computerName || metaEntry?.ip || 'Nepoznato' }}
              </h3>
              <button
                @click="closeMetadata"
                class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                aria-label="Zatvori"
              >
                &times;
              </button>
            </div>

            <div class="p-4">
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
                    <h4 class="font-semibold mb-2">🪟 Operativni sistem</h4>
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
                    <h4 class="font-semibold mb-2">💻 Sistem</h4>
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
                    <h4 class="font-semibold mb-2">🧠 CPU</h4>
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
                      🧩 RAM moduli ({{ meta.RAMModules?.length || 0 }})
                    </h4>
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
                    <h4 class="font-semibold mb-2">💽 Diskovi ({{ meta.Storage?.length || 0 }})</h4>
                    <div v-if="meta.Storage?.length" class="space-y-2">
                      <div
                        v-for="(s, idx) in meta.Storage"
                        :key="idx"
                        class="border rounded p-3 bg-white"
                      >
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
                    <h4 class="font-semibold mb-2">🎮 GPU ({{ meta.GPUs?.length || 0 }})</h4>
                    <div v-if="meta.GPUs?.length" class="space-y-2">
                      <div
                        v-for="(g, idx) in meta.GPUs"
                        :key="idx"
                        class="border rounded p-3 bg-white"
                      >
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
                    <h4 class="font-semibold mb-2">🌐 Mreža ({{ meta.NICs?.length || 0 }})</h4>
                    <div v-if="meta.NICs?.length" class="space-y-2">
                      <div
                        v-for="(n, idx) in meta.NICs"
                        :key="idx"
                        class="border rounded p-3 bg-white"
                      >
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
                    <h4 class="font-semibold mb-2">🧬 BIOS / Matična</h4>
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
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- Printers drawer -->
    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showPrintersModal"
          class="fixed inset-0 z-[9996] flex"
          @click.self="closePrinters"
          role="dialog"
          aria-modal="true"
        >
          <div class="absolute inset-0 bg-black/40"></div>

          <div
            class="relative ml-auto h-full w-full sm:w-[560px] bg-white shadow-xl overflow-y-auto"
          >
            <div
              class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between"
            >
              <h3 class="text-lg font-semibold">
                🖨 Štampači — {{ printersEntry?.computerName || printersEntry?.ip || 'Nepoznato' }}
              </h3>
              <button
                @click="closePrinters"
                class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                aria-label="Zatvori"
              >
                &times;
              </button>
            </div>

            <div class="p-4 space-y-6">
              <div v-if="printersLoading" class="text-gray-600">Učitavanje…</div>
              <div v-else-if="printersError" class="text-red-600">{{ printersError }}</div>

              <template v-else>
                <div class="rounded-lg border p-3 bg-slate-50">
                  <div class="text-sm font-medium mb-2">
                    Brzo povezivanje ovog računara na štampač
                  </div>
                  <div class="flex gap-2 items-center flex-wrap">
                    <input
                      v-model="printersSelectSearch"
                      placeholder="🔎 Pretraga štampača..."
                      class="border px-2 py-1 rounded text-sm w-full sm:w-auto"
                    />
                    <select
                      v-model="selectedPrinterId"
                      class="border px-2 py-1 rounded text-sm w-full sm:w-auto min-w-[220px]"
                    >
                      <option disabled value="">— odaberi štampač —</option>
                      <option v-for="p in filteredPrintersAll" :key="p._id" :value="p._id">
                        {{ p.name || '—' }} ({{ p.ip || 'no-ip' }})
                      </option>
                    </select>
                    <button
                      @click="selectedPrinterId && connectPrinter(selectedPrinterId)"
                      class="bg-emerald-600 text-white px-3 py-1 rounded text-sm hover:bg-emerald-700 disabled:opacity-50"
                      :disabled="!selectedPrinterId || !printersEntry"
                    >
                      🔗 Poveži
                    </button>
                    <RouterLink to="/printers" class="text-sm text-indigo-600 hover:underline"
                      >📃 Lista svih štampača</RouterLink
                    >
                  </div>
                </div>

                <section class="rounded-lg border p-4">
                  <div class="flex items-center justify-between mb-2">
                    <h4 class="font-semibold">🧷 Hostovani (USB + share na ovom računaru)</h4>
                  </div>

                  <div v-if="printersData.hosted.length" class="space-y-2">
                    <div
                      v-for="p in printersData.hosted"
                      :key="p._id"
                      class="border rounded p-3 bg-slate-50"
                    >
                      <div class="font-medium flex items-center justify-between">
                        <span>{{ p.name || '—' }}</span>
                        <div class="flex gap-2">
                          <button
                            @click="unsetHostPrinter(p._id)"
                            class="text-sm text-red-600 hover:underline"
                          >
                            Ukloni host
                          </button>
                        </div>
                      </div>
                      <div class="text-sm text-gray-600">
                        {{ [p.manufacturer, p.model].filter(Boolean).join(' · ') || '—' }}
                      </div>
                      <div class="text-sm">IP: {{ p.ip || '—' }}</div>
                      <div class="text-xs text-gray-500">Shared: {{ p.shared ? 'DA' : 'NE' }}</div>
                    </div>
                  </div>
                  <div v-else class="text-sm text-gray-500">Nema hostovanih štampača.</div>
                </section>

                <section class="rounded-lg border p-4">
                  <h4 class="font-semibold mb-2">🔗 Povezani (instalirani na ovom računaru)</h4>

                  <div v-if="printersData.connected.length" class="space-y-2">
                    <div
                      v-for="p in printersData.connected"
                      :key="p._id"
                      class="border rounded p-3 bg-white"
                    >
                      <div class="font-medium flex items-center justify-between">
                        <span>{{ p.name || '—' }}</span>
                        <div class="flex gap-2">
                          <button
                            @click="disconnectPrinter(p._id)"
                            class="text-sm text-amber-700 hover:underline"
                          >
                            Otkači
                          </button>
                          <button
                            @click="setHostPrinter(p._id)"
                            class="text-sm text-indigo-700 hover:underline"
                          >
                            Postavi host
                          </button>
                        </div>
                      </div>
                      <div class="text-sm text-gray-600">
                        {{ [p.manufacturer, p.model].filter(Boolean).join(' · ') || '—' }}
                      </div>
                      <div class="text-sm">IP: {{ p.ip || '—' }}</div>
                      <div class="text-xs text-gray-500">Shared: {{ p.shared ? 'DA' : 'NE' }}</div>
                    </div>
                  </div>
                  <div v-else class="text-sm text-gray-500">Nema povezanih štampača.</div>
                </section>
              </template>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- New: Domains drawer (per-IP) -->
    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showDomains"
          class="fixed inset-0 z-[9995] flex"
          @click.self="closeDomains"
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
              <h3 class="text-lg font-semibold">
                🌐 DNS logovi — {{ domainsFor?.ip || 'Nepoznato' }}
              </h3>
              <button
                @click="closeDomains"
                class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                aria-label="Zatvori"
              >
                &times;
              </button>
            </div>

            <div class="p-4 space-y-4">
              <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  v-model="domainsSearch"
                  @keyup.enter="fetchDomainsForIp()"
                  placeholder="🔎 Pretraga domain/ip…"
                  class="border px-3 py-2 rounded w-full sm:w-1/2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div class="flex items-center gap-2">
                  <select v-model="domainsSortBy" class="border px-2 py-2 rounded text-sm">
                    <option value="timestamp">Vreme</option>
                    <option value="name">Domain</option>
                  </select>
                  <button @click="toggleDomainsSort" class="px-3 py-2 border rounded text-sm">
                    {{ domainsSortOrder === 'asc' ? '↑' : '↓' }}
                  </button>
                  <label class="inline-flex items-center text-sm gap-2">
                    <input
                      type="checkbox"
                      v-model="domainsBlockedOnly"
                      @change="fetchDomainsForIp()"
                    />
                    Samo blokirani
                  </label>
                </div>
                <div class="sm:ml-auto text-sm text-gray-600">
                  Prikazano {{ domainsItems.length }} / {{ domainsTotal }}
                </div>
              </div>

              <div class="space-y-2">
                <div
                  v-for="d in domainsItems"
                  :key="d._id"
                  class="border rounded-lg p-3 bg-slate-50 flex items-center justify-between"
                >
                  <div class="min-w-0">
                    <div class="font-medium truncate">{{ d.name }}</div>
                    <div class="text-xs text-gray-500">
                      {{ new Date(d.timestamp).toLocaleString() }} •
                      {{ d.category === 'blocked' ? '🚫 blocked' : '✅ normal' }}
                    </div>
                  </div>
                  <div class="text-xs text-gray-600 shrink-0">
                    IP: {{ d.ip || domainsFor?.ip || '—' }}
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-between pt-2">
                <div class="text-sm">Strana {{ domainsPage }}</div>
                <div class="flex items-center gap-2">
                  <button
                    class="px-2 py-1 bg-gray-200 rounded"
                    :disabled="domainsPage <= 1"
                    @click="prevDomainsPage"
                  >
                    ⬅️
                  </button>

                  <button
                    class="px-2 py-1 bg-gray-200 rounded"
                    :disabled="domainsPage * domainsLimit >= domainsTotal"
                    @click="nextDomainsPage"
                  >
                    ➡️
                  </button>
                </div>
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
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

const router = useRouter()
const route = useRoute()

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const page = ref(parseInt(route.query.page) || 1)
const limit = ref(parseInt(route.query.limit) || 10)
const search = ref(route.query.search || '')
const sortBy = ref(route.query.sortBy || 'ip')
const sortOrder = ref(route.query.sortOrder || 'asc')
const currentPageDisplay = computed(() => (totalPages.value === 0 ? '0' : page.value))

const showPasswords = ref(false)
const copiedText = ref(null)

const availableIps = ref([])
const showingAvailableModal = ref(false)
const ipSearch = ref('')

const showMeta = ref(false)
const metaLoading = ref(false)
const metaError = ref(null)
const metaEntry = ref(null)
const meta = ref(null)

const showPrintersModal = ref(false)
const printersLoading = ref(false)
const printersError = ref(null)
const printersEntry = ref(null)
const printersData = ref({ hosted: [], connected: [] })
const printersAll = ref([])
const printersSelectSearch = ref('')
const selectedPrinterId = ref('')

// --- Domains drawer state ---
const showDomains = ref(false)
const domainsFor = ref(null)
const domainsItems = ref([])
const domainsTotal = ref(0)
const domainsPage = ref(1)
const domainsLimit = ref(20)
const domainsSearch = ref('')
const domainsSortBy = ref('timestamp')
const domainsSortOrder = ref('desc')
const domainsBlockedOnly = ref(false)

const sortOptions = [
  { value: 'ip', label: 'IP adresa' },
  { value: 'computerName', label: 'Ime računara' },
  { value: 'username', label: 'Korisničko ime' },
  { value: 'fullName', label: 'Puno ime' },
  { value: 'department', label: 'Odeljenje' },
  { value: 'rdp', label: 'RDP' },
  { value: 'dnsLog', label: 'DNS Log' },
  { value: 'anyDesk', label: 'AnyDesk' },
  { value: 'system', label: 'Sistem' },
]

watch([sortBy, sortOrder], () => {
  page.value = 1
})

const addEntry = () => router.push('/add')
const editEntry = (entry) => router.push(`/edit/${entry._id}`)

async function fetchData() {
  const params = new URLSearchParams({
    page: page.value,
    limit: limit.value,
    search: search.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  })

  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses?${params.toString()}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    entries.value = data.entries
    total.value = data.total
    totalPages.value = data.totalPages
  } catch (err) {
    console.error('Neuspešno dohvatanje podataka')
  }
}

const deleteEntry = async (id) => {
  if (!confirm('Da li si siguran da želiš da obrišeš ovaj unos?')) return
  const res = await fetchWithAuth(`/api/protected/ip-addresses/${id}`, { method: 'DELETE' })
  if (res.ok) fetchData()
}

const handleFileUpload = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetchWithAuth('/api/protected/ip-addresses/import', {
    method: 'POST',
    body: formData,
  })
  if (res.ok) fetchData()
}

const showAvailableIps = async () => {
  try {
    const res = await fetchWithAuth('/api/protected/ip-addresses/available')
    const data = await res.json()
    availableIps.value = data.available
  } catch {
    availableIps.value = []
  } finally {
    showingAvailableModal.value = true
  }
}
const closeAvailableModal = () => {
  showingAvailableModal.value = false
  availableIps.value = []
}

const copyToClipboard = async (text, label = 'Kopirano!') => {
  try {
    await navigator.clipboard.writeText(text)
    copiedText.value = `✅ ${label}`
  } catch {
    copiedText.value = '❌ Neuspešno kopiranje'
  }
  setTimeout(() => (copiedText.value = null), 2000)
}

const generateRdpFile = (entry) => {
  const rdpContent = `
full address:s:${entry.ip}
username:s:${entry.username || ''}
prompt for credentials:i:1
authentication level:i:2
redirectclipboard:i:1
redirectprinters:i:0
redirectcomports:i:0
redirectsmartcards:i:0
`.trim()

  const blob = new Blob([rdpContent], { type: 'application/x-rdp' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${entry.computerName || entry.ip}.rdp`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const nextPage = () => {
  if (page.value * limit.value < total.value) page.value++
}
const prevPage = () => {
  if (page.value > 1) page.value--
}

const exportToXlsx = async () => {
  try {
    const res = await fetchWithAuth(
      `/api/protected/ip-addresses/export-xlsx?search=${encodeURIComponent(search.value)}`
    )
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ip-entries.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    console.log('Greška pri izvozu XLSX-a')
  }
}

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? '—' : dt.toLocaleString()
}
const fmtGb = (n) => (n || n === 0 ? `${n} GB` : '—')
const fmtMbps = (n) => (n || n === 0 ? `${n} Mbps` : '—')
const safe = (v) => v ?? '—'

/** Human-ish relative time */
const fmtRelative = (d) => {
  if (!d) return '—'
  const t = new Date(d).getTime()
  if (isNaN(t)) return '—'
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'pre par sekundi'
  const m = Math.floor(s / 60)
  if (m < 60) return `pre ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `pre ${h} h`
  const days = Math.floor(h / 24)
  return `pre ${days} d`
}

/** Tooltip text for the status pill */
const statusTooltip = (e) => {
  const onlineTxt = e.isOnline ? 'Online' : 'Offline'
  const lc = e.lastChecked ? new Date(e.lastChecked).toLocaleString() : '—'
  const lsc = e.lastStatusChange ? new Date(e.lastStatusChange).toLocaleString() : '—'
  return `${onlineTxt}\nPoslednja provera: ${lc}\nPromena statusa: ${lsc}`
}

// ---- Metadata drawer ----
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

// ---- Printers drawer ----
const showPrinters = () => (showPrintersModal.value = true)
const openPrinters = async (entry) => {
  printersEntry.value = entry
  printersLoading.value = true
  printersError.value = null
  printersData.value = { hosted: [], connected: [] }
  selectedPrinterId.value = ''
  showPrintersModal.value = true

  try {
    const res = await fetchWithAuth(
      `/api/protected/ip-addresses/by-ip/${encodeURIComponent(entry.ip)}/printers`
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    printersData.value = await res.json()

    const resAll = await fetchWithAuth('/api/protected/printers?limit=1000')
    printersAll.value = resAll.ok ? (await resAll.json()).items || [] : []
  } catch (e) {
    console.error(e)
    printersError.value = 'Neuspešno učitavanje štampača.'
  } finally {
    printersLoading.value = false
  }
}
const closePrinters = () => {
  showPrintersModal.value = false
  printersData.value = { hosted: [], connected: [] }
  printersEntry.value = null
  printersError.value = null
  selectedPrinterId.value = ''
  printersSelectSearch.value = ''
}

const connectPrinter = async (printerId) => {
  if (!printersEntry.value) return
  try {
    await fetchWithAuth(`/api/protected/printers/${printerId}/connect`, {
      method: 'POST',
      body: JSON.stringify({ computer: printersEntry.value.ip }),
    })
    await openPrinters(printersEntry.value)
  } catch (e) {
    console.error(e)
  }
}
const disconnectPrinter = async (printerId) => {
  if (!printersEntry.value) return
  try {
    await fetchWithAuth(`/api/protected/printers/${printerId}/disconnect`, {
      method: 'POST',
      body: JSON.stringify({ computer: printersEntry.value.ip }),
    })
    await openPrinters(printersEntry.value)
  } catch (e) {
    console.error(e)
  }
}
const setHostPrinter = async (printerId) => {
  if (!printersEntry.value) return
  try {
    await fetchWithAuth(`/api/protected/printers/${printerId}/set-host`, {
      method: 'POST',
      body: JSON.stringify({ computer: printersEntry.value.ip }),
    })
    await openPrinters(printersEntry.value)
  } catch (e) {
    console.error(e)
  }
}
const unsetHostPrinter = async (printerId) => {
  try {
    await fetchWithAuth(`/api/protected/printers/${printerId}/unset-host`, { method: 'POST' })
    await openPrinters(printersEntry.value)
  } catch (e) {
    console.error(e)
  }
}

const filteredAvailableIps = computed(() =>
  availableIps.value.filter((ip) => ip.toLowerCase().includes(ipSearch.value.toLowerCase()))
)
const printersAllFree = computed(() => printersAll.value.filter((p) => !p.hostComputer))
const filteredPrintersAll = computed(() => {
  const base = printersAllFree.value
  if (!printersSelectSearch.value) return base
  const q = printersSelectSearch.value.toLowerCase()
  return base.filter((p) =>
    [p.name, p.manufacturer, p.model, p.ip].filter(Boolean).join(' ').toLowerCase().includes(q)
  )
})

// ---- Domains drawer ----
const toggleDomainsSort = () => {
  domainsSortOrder.value = domainsSortOrder.value === 'asc' ? 'desc' : 'asc'
  fetchDomainsForIp()
}
const prevDomainsPage = () => {
  if (domainsPage.value > 1) {
    domainsPage.value--
    fetchDomainsForIp()
  }
}
const nextDomainsPage = () => {
  if (domainsPage.value * domainsLimit.value < domainsTotal.value) {
    domainsPage.value++
    fetchDomainsForIp()
  }
}
const openDomainsForIp = (entry) => {
  domainsFor.value = { ip: entry.ip, _id: entry._id }
  domainsPage.value = 1
  domainsSearch.value = entry.ip
  showDomains.value = true
  fetchDomainsForIp()
}
const closeDomains = () => {
  showDomains.value = false
  domainsFor.value = null
  domainsItems.value = []
  domainsTotal.value = 0
  domainsSearch.value = ''
}
async function fetchDomainsForIp() {
  try {
    const params = new URLSearchParams({
      page: String(domainsPage.value),
      limit: String(domainsLimit.value),
      search: domainsSearch.value || (domainsFor.value?.ip ?? ''),
      sortBy: domainsSortBy.value,
      sortOrder: domainsSortOrder.value,
    })
    const path = domainsBlockedOnly.value
      ? '/api/protected/domains/blocked'
      : '/api/protected/domains'
    const res = await fetchWithAuth(`${path}?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    domainsItems.value = Array.isArray(data.data) ? data.data : []
    domainsTotal.value = data.total ?? 0
  } catch (e) {
    console.error('Neuspešno učitavanje domena:', e)
    domainsItems.value = []
    domainsTotal.value = 0
  }
}

// ---- Keep statuses fresh (sync with ping loop) ----
const AUTO_REFRESH_SEC = 30
let refreshTimer = null
onMounted(() => {
  refreshTimer = setInterval(() => {
    fetchData()
  }, AUTO_REFRESH_SEC * 1000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// ---- Router sync ----
watch([page, limit, search, sortBy, sortOrder], () => {
  router.push({
    query: {
      page: page.value,
      limit: limit.value,
      search: search.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    },
  })
})
watch(
  () => route.query,
  (query) => {
    page.value = parseInt(query.page) || 1
    limit.value = parseInt(query.limit) || 10
    search.value = query.search || ''
    sortBy.value = query.sortBy || 'ip'
    sortOrder.value = query.sortOrder || 'asc'
    fetchData()
  },
  { immediate: true }
)

const goToAddWithIp = (ip) => router.push({ path: '/add', query: { ip } })
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.glass-container {
  backdrop-filter: saturate(140%) blur(2px);
}
</style>
