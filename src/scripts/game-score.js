const COMPONENT_NAME = 'game-score'

const createInstance = (system, componentRoot) => {
  const renderScore = () => {
    componentRoot.innerHTML = window.game.computeScore()
  }

  window.game.on('game-updated', () => {
    renderScore()
  })

  renderScore()

  return {
    defaultAction: renderScore,
  }
}

export default () => {
  return {
    componentName: COMPONENT_NAME,
    createInstance,
  }
}
