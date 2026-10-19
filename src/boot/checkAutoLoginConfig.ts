import { defineBoot } from '#q-app/wrappers';
import axios from 'axios';
import { Platform } from 'quasar';
import { useNodeStore } from 'src/stores/node';
import type { NodeLoginDataInterface } from 'src/stores/node';

export default defineBoot(({ store }) => {
  if (Platform.is.electron) {
    return;
  }
  // absolute: in history mode a relative URL would resolve against the current page path
  void axios.get(`${process.env.VUE_ROUTER_BASE ?? '/'}config.json`).then((response) => {
    const nodeStore = useNodeStore(store);
    if (response.data && response.data.apiKey) {
      nodeStore.login(response.data);
    }
    if (response.data && response.data.history) {
      response.data.history.forEach((historyItem: NodeLoginDataInterface) => {
        const historyJson = JSON.stringify(historyItem);
        if (!nodeStore.loginHistory.includes(historyJson)) {
          nodeStore.loginHistory.push(historyJson);
        }
      });
    }
  });
});
