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
