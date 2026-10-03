// scenes/WorldScene.js — host DOM neutro do MAIN_SCENE.
//
// O renderer WebGL é o conteúdo visual do mundo. Esta cena existe para que o
// SceneManager possa desmontar LoadingScene quando o world fica pronto. O R11
// mantinha LoadingScene como current scene após _buildWorld(), portanto a arte
// do loading continuava acima do WebGL enquanto HUD/chat/minimap já apareciam.
export default class WorldScene {
  mount(container) {
    this.el = container;
    container.dataset.mu = 'world-scene-host';
    container.style.cssText += `
      background:transparent;
      pointer-events:none;
      overflow:hidden;`;
  }
  show() {}
  hide() {}
  update() {}
  dispose() { this.el = null; }
}
