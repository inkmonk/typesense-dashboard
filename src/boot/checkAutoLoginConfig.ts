import { defineBoot } from '#q-app';
import axios from 'axios';
import { Platform } from 'quasar';
import { useNodeStore } from '@/stores/node';
import type { NodeLoginDataInterface } from '@/stores/node';

export default defineBoot(({ store }) => {
  if (Platform.is.electron) {
    return;
  }
  // absolute: in history mode a relative URL would resolve against the current page path
  void axios.get(`${import.meta.env.QUASAR_VUE_ROUTER_BASE ?? '/'}config.json`).then((response) => {
    const nodeStore = useNodeStore(store);
    if (response.data && response.data.node) {
      let node = response.data.node;
      if (node?.host && String(node.host).toUpperCase() === 'SAME') {
        const loc = window.location;
        const protocol = String(loc.protocol || '').replace(':', '') || node.protocol || 'http';
        const defaultPort = protocol === 'https' ? 443 : 80;
        const port = Number(loc.port || node.port || defaultPort);
        node = {
          ...node,
          host: loc.hostname,
          port,
          protocol,
        };
        response.data.node = node;
      }

      nodeStore.setCurrentNodeConfig(node);

      if (response.data.apiKey) {
        nodeStore.login(response.data);
      }
    }
    if (response.data && response.data.history) {
      response.data.history.forEach((historyItem: NodeLoginDataInterface) => {
        const historyJson = JSON.stringify(historyItem);
        if (!nodeStore.loginHistory.includes(historyJson)) {
          nodeStore.loginHistory.push(historyJson);
        }
      });
    }
    // Handle UI configuration options
    if (response.data && response.data.ui) {
      nodeStore.setUIConfig(response.data.ui);
    }
  });
});
