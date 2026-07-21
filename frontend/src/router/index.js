import { createRouter, createWebHistory } from 'vue-router'
import { isTokenExpired } from '@/utils/auth.js'

const MainLayout = () => import('@/layouts/MainLayout.vue')
const HomeView = () => import('@/views/HomeView.vue')
const LoginView = () => import('@/views/LoginView.vue')
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
const AgentsView = () => import('@/views/AgentsView.vue')
const AgentDetailView = () => import('@/views/AgentDetailView.vue')
const AgentReleasesView = () => import('@/views/AgentReleasesView.vue')

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
      ],
    },
    {
      path: '/login',
      name: 'login',
      meta: { guestOnly: true, title: 'Prijavi se - NetDesk' },
      component: LoginView,
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
      const returnTo = encodeURIComponent(to.fullPath || '/')
      return next(`/login?returnTo=${returnTo}`)
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
