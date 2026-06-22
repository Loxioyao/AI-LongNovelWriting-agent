import { createRouter, createWebHistory } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/project/:id',
    component: () => import('@/views/WorkspaceView.vue'),
    children: [
      {
        path: '',
        name: 'overview',
        component: () => import('@/views/OverviewView.vue'),
        meta: { title: '项目概览' }
      },
      {
        path: 'outline',
        name: 'outline',
        component: () => import('@/views/OutlineView.vue'),
        meta: { title: '故事大纲' }
      },
      {
        path: 'characters',
        name: 'characters',
        component: () => import('@/views/CharactersView.vue'),
        meta: { title: '人物卡管理' }
      },
      {
        path: 'chapters',
        name: 'chapters',
        component: () => import('@/views/ChaptersView.vue'),
        meta: { title: '章节编辑' }
      },
      {
        path: 'longform',
        name: 'longform',
        component: () => import('@/views/LongFormView.vue'),
        meta: { title: '长篇生成' }
      },
      {
        path: 'agents',
        name: 'agents',
        component: () => import('@/views/AgentsView.vue'),
        meta: { title: 'AI协作室' }
      }
    ]
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  document.title = `${to.meta.title || 'AI写作'} - AI协作小说创作平台`
})

export default router
