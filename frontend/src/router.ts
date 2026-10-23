import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/views/HomeView.vue') },
    { path: '/city/:cid', component: () => import('@/views/CityView.vue'), props: true },
    { path: '/dashboard/:cid', component: () => import('@/views/DashboardView.vue'), props: true },
    { path: '/handout/:id', component: () => import('@/views/HandoutView.vue'), props: true },
    {
      path: '/admin',
      component: () => import('@/views/admin/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/admin/channels' },
        { path: 'channels', component: () => import('@/views/admin/ChannelList.vue') },
        { path: 'channels/:cid', component: () => import('@/views/admin/ChannelDetail.vue'), props: true },
        { path: 'channels/:cid/raw', component: () => import('@/views/admin/RawData.vue'), props: true },
        { path: 'channels/:cid/report', component: () => import('@/views/admin/QualityReport.vue'), props: true },
        { path: 'channels/:cid/report/scroll', component: () => import('@/views/admin/ReportScroll.vue'), props: true },
        { path: 'replays/:id', component: () => import('@/views/admin/GameConfig.vue'), props: true }
      ]
    }
  ]
})
