import { createRouter, createWebHistory } from 'vue-router'
import { isTokenExpired, decodeJwt } from '@/utils/auth.js'
import { resetCurrentUser } from '@/composables/useCurrentUser.js'
import { isValidSite } from '@/constants/sites.js'
import { getRememberedSite, rememberSite } from '@/utils/siteStorage.js'

const MainLayout = () => import('@/layouts/MainLayout.vue')
const HomeView = () => import('@/views/HomeView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const SelectSiteView = () => import('@/views/SelectSiteView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')
const AddIpView = () => import('@/views/AddIpView.vue')
const EditIpView = () => import('@/views/EditIpView.vue')
const MetadataView = () => import('@/views/MetadataView.vue')
const PrintersView = () => import('@/views/PrintersView.vue')
const InventoryView = () => import('@/views/InventoryView.vue')
const PDSUAnalyticsView = () => import('@/views/PDSUAnalyticsView.vue')
const IpMetaView = () => import('@/views/IpMetaView.vue')
const IpPdsuView = () => import('@/views/IpPdsuView.vue')
const IpPortScanView = () => import('@/views/IpPortScanView.vue')
const DuplicateNamesView = () => import('@/views/DuplicateNamesView.vue')
const ComputersForRepackView = () => import('@/views/ComputersForRepackView.vue')
const AgentsView = () => import('@/views/AgentsView.vue')
const AgentDetailView = () => import('@/views/AgentDetailView.vue')
const AgentReleasesView = () => import('@/views/AgentReleasesView.vue')
const BatchJobsView = () => import('@/views/BatchJobsView.vue')
const BatchJobDetailView = () => import('@/views/BatchJobDetailView.vue')
const ComputersWithoutAgentView = () => import('@/views/ComputersWithoutAgentView.vue')
const DownloadsFolderView = () => import('@/views/DownloadsFolderView.vue')
const ReportsView = () => import('@/views/ReportsView.vue')
const UsersView = () => import('@/views/UsersView.vue')
const LogsView = () => import('@/views/LogsView.vue')
const ConfigView = () => import('@/views/ConfigView.vue')
const ServerHealthView = () => import('@/views/ServerHealthView.vue')
const DnsLogsView = () => import('@/views/DnsLogsView.vue')
const ProcessDetectionsView = () => import('@/views/ProcessDetectionsView.vue')
const VncSessionView = () => import('@/views/VncSessionView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true, title: 'Početna - NetDesk' },
      children: [
        {
          path: '',
          name: 'home',
          meta: { title: 'Početna - NetDesk', breadcrumb: 'IP Adrese' },
          component: HomeView,
        },
        {
          path: 'add',
          name: 'add-ip',
          meta: {
            title: 'Dodaj IP - NetDesk',
            breadcrumb: 'Dodaj IP',
            breadcrumbParent: { label: 'IP Adrese', to: '/' },
          },
          component: AddIpView,
        },
        {
          path: 'edit/:id',
          name: 'edit-ip',
          meta: {
            title: 'Uredi IP - NetDesk',
            breadcrumb: 'Uredi IP',
            breadcrumbParent: { label: 'IP Adrese', to: '/' },
            // Konkretan postojeći unos, sopstveni site već poznat iz baze.
            requiresSite: false,
          },
          component: EditIpView,
        },
        {
          path: 'ip/:id/meta',
          name: 'ip-meta',
          meta: {
            title: 'Metapodaci - NetDesk',
            breadcrumb: 'Metapodaci',
            breadcrumbParent: { label: 'IP Adrese', to: '/' },
            // Per-računar detalj strana - lokacija je već implicitna kroz
            // taj jedan IP unos (svoj site u bazi), ne treba filter.
            requiresSite: false,
          },
          component: IpMetaView,
        },
        {
          path: 'ip/:id/pdsu',
          name: 'ip-pdsu',
          meta: {
            title: 'PDSU Inventar - NetDesk',
            breadcrumb: 'PDSU Inventar',
            breadcrumbParent: { label: 'IP Adrese', to: '/' },
            requiresSite: false,
          },
          component: IpPdsuView,
        },
        {
          path: 'ip/:id/port-scan',
          name: 'ip-port-scan',
          meta: {
            title: 'Port scan - NetDesk',
            breadcrumb: 'Port scan',
            breadcrumbParent: { label: 'IP Adrese', to: '/' },
            requiresSite: false,
          },
          component: IpPortScanView,
        },
        {
          path: 'duplicates',
          name: 'duplicates',
          meta: {
            title: 'Duplirana imena - NetDesk',
            breadcrumb: 'Duplirana imena',
            breadcrumbParent: { label: 'IP Adrese', to: '/' },
          },
          component: DuplicateNamesView,
        },
        {
          path: 'computers-for-repack',
          name: 'computers-for-repack',
          meta: {
            title: 'Računari za pakovanje - NetDesk',
            breadcrumb: 'Računari za pakovanje',
            breadcrumbParent: { label: 'IP Adrese', to: '/' },
          },
          component: ComputersForRepackView,
        },
        {
          path: 'metadata',
          name: 'metadata',
          meta: { title: 'Metapodaci - NetDesk', breadcrumb: 'Metapodaci' },
          component: MetadataView,
        },
        {
          path: 'printers',
          name: 'printers',
          meta: { title: 'Štampači - NetDesk', breadcrumb: 'Štampači' },
          component: PrintersView,
        },
        {
          path: 'inventory',
          name: 'inventory',
          meta: { title: 'Inventar hardvera - NetDesk', breadcrumb: 'Inventar hardvera' },
          component: InventoryView,
        },
        {
          path: 'pdsu',
          name: 'pdsu',
          meta: { title: 'PDSU Analitika - NetDesk', breadcrumb: 'PDSU Analitika' },
          component: PDSUAnalyticsView,
        },
        {
          path: 'agents',
          name: 'agents',
          meta: { title: 'Netdesk Agenti - NetDesk', breadcrumb: 'Agenti' },
          component: AgentsView,
        },
        {
          path: 'agents/:id',
          name: 'agent-detail',
          meta: {
            title: 'Agent - NetDesk',
            breadcrumb: 'Detalji agenta',
            breadcrumbParent: { label: 'Agenti', to: '/agents' },
            // Konkretan agent, vezan za jedan računar čiji je site već poznat.
            requiresSite: false,
          },
          component: AgentDetailView,
        },
        {
          path: 'agent-releases',
          name: 'agent-releases',
          meta: {
            title: 'Verzije agenta - NetDesk',
            breadcrumb: 'Verzije agenta',
            breadcrumbParent: { label: 'Agenti', to: '/agents' },
          },
          component: AgentReleasesView,
        },
        {
          path: 'agent-batches',
          name: 'agent-batches',
          meta: {
            title: 'Batch komande - NetDesk',
            breadcrumb: 'Batch komande',
            breadcrumbParent: { label: 'Agenti', to: '/agents' },
          },
          component: BatchJobsView,
        },
        {
          path: 'agent-batches/:batchId',
          name: 'agent-batch-detail',
          meta: {
            title: 'Status batch komande - NetDesk',
            breadcrumb: 'Status batch komande',
            breadcrumbParent: { label: 'Batch komande', to: '/agent-batches' },
            // Konkretan batch po id-ju, može obuhvatati agente sa obe
            // lokacije - nema smisla vezivati ga za jednu.
            requiresSite: false,
          },
          component: BatchJobDetailView,
        },
        {
          path: 'computers-without-agent',
          name: 'computers-without-agent',
          meta: {
            title: 'Računari bez agenta - NetDesk',
            breadcrumb: 'Računari bez agenta',
            breadcrumbParent: { label: 'Agenti', to: '/agents' },
          },
          component: ComputersWithoutAgentView,
        },
        {
          path: 'downloads-folder',
          name: 'downloads-folder',
          meta: {
            title: 'Deljeni fajlovi - NetDesk',
            breadcrumb: 'Deljeni fajlovi',
            breadcrumbParent: { label: 'Agenti', to: '/agents' },
            requiresAdmin: true,
          },
          component: DownloadsFolderView,
        },
        {
          path: 'reports',
          name: 'reports',
          meta: { title: 'Dnevni izveštaj - NetDesk', breadcrumb: 'Izveštaji' },
          component: ReportsView,
        },
        {
          path: 'reports/:id',
          name: 'report-detail',
          meta: {
            title: 'Izveštaj - NetDesk',
            breadcrumb: 'Detalji izveštaja',
            breadcrumbParent: { label: 'Izveštaji', to: '/reports' },
          },
          component: ReportsView,
        },
        {
          path: 'users',
          name: 'users',
          meta: { title: 'Korisnici - NetDesk', breadcrumb: 'Korisnici', requiresAdmin: true },
          component: UsersView,
        },
        {
          path: 'logs',
          name: 'logs',
          meta: { title: 'Logovi - NetDesk', breadcrumb: 'Logovi', requiresAdmin: true },
          component: LogsView,
        },
        {
          path: 'config',
          name: 'config',
          meta: { title: 'Konfiguracija - NetDesk', breadcrumb: 'Konfiguracija', requiresAdmin: true },
          component: ConfigView,
        },
        {
          path: 'server-health',
          name: 'server-health',
          meta: { title: 'Server - NetDesk', breadcrumb: 'Server', requiresOperator: true },
          component: ServerHealthView,
        },
        {
          path: 'dns-logs',
          name: 'dns-logs',
          meta: { title: 'DNS Logovi - NetDesk', breadcrumb: 'DNS Logovi', requiresOperator: true },
          component: DnsLogsView,
        },
        {
          path: 'process-detections',
          name: 'process-detections',
          meta: { title: 'Sumnjivi procesi - NetDesk', breadcrumb: 'Sumnjivi procesi', requiresOperator: true },
          component: ProcessDetectionsView,
        },
      ],
    },
    {
      path: '/login',
      name: 'login',
      meta: { guestOnly: true, title: 'Prijavi se - NetDesk' },
      component: LoginView,
    },
    {
      // Van MainLayout-a namerno, isti obrazac kao /login - kartice za izbor
      // lokacije (Bolnica/Dom zdravlja), pre nego što se nastavi na traženu
      // stranu. requiresSite: false da guard ne uđe u beskonačnu petlju
      // preusmeravanja na samog sebe.
      path: '/select-site',
      name: 'select-site',
      meta: { requiresAuth: true, requiresSite: false, title: 'Izbor lokacije - NetDesk' },
      component: SelectSiteView,
    },
    {
      // Van MainLayout-a namerno - otvara se u posebnom browser prozoru
      // (window.open iz VncViewer.vue), pa ne treba nav/sidebar hromiranje.
      // requiresSite: false - samostalna po-agentu strana, ne filtrira po
      // lokaciji, pa ne treba da bude preusmerena na /select-site.
      path: '/agents/:id/screen',
      name: 'agent-vnc-session',
      meta: { requiresAuth: true, requiresSite: false, title: 'Udaljena kontrola ekrana - NetDesk' },
      component: VncSessionView,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      meta: { title: '404 - NetDesk' },
      component: NotFoundView,
    },
  ],
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')

  if (to.meta.requiresAuth) {
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem('token')
      resetCurrentUser()
      const returnTo = encodeURIComponent(to.fullPath || '/')
      return next(`/login?returnTo=${returnTo}`)
    }
    if (to.meta.requiresAdmin && decodeJwt(token)?.role !== 'admin') {
      return next('/')
    }
    if (to.meta.requiresOperator && !['admin', 'operator'].includes(decodeJwt(token)?.role)) {
      return next('/')
    }

    // Lokacija (Bolnica/Dom zdravlja) se nosi kao URL query param na svakoj
    // strani (korisnikova eksplicitna odluka, linkovi ostaju deljivi/tačni) -
    // ovo je isti "guard-injektuje-state" pristup kao auth provera iznad,
    // samo jedno mesto za izmenu umesto diranja desetina postojećih
    // router-link/router.push poziva. localStorage (preko siteStorage.js) je
    // fallback ISPOD from.query.site - rešava svež tab/bookmark bez ?site=
    // koji je ranije uvek bacao na /select-site čak i kad je korisnik uvek
    // na istoj lokaciji.
    if (to.meta.requiresSite !== false) {
      if (!isValidSite(to.query.site)) {
        const fallbackSite = isValidSite(from.query.site) ? from.query.site : getRememberedSite()
        if (isValidSite(fallbackSite)) {
          return next({ ...to, query: { ...to.query, site: fallbackSite } })
        }
        const returnTo = encodeURIComponent(to.fullPath || '/')
        return next(`/select-site?returnTo=${returnTo}`)
      }
      rememberSite(to.query.site)
    }
  }

  if (to.meta.guestOnly && token && !isTokenExpired(token)) {
    return next('/')
  }

  const title = to.meta?.title || 'NetDesk'
  if (typeof document !== 'undefined') document.title = title

  next()
})

export default router
