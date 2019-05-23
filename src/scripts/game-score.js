const COMPONENT_NAME = 'game-score'

const createInstance = (system, componentRoot) => {
  let CURRENT_SCORE = 0
  const renderScore = () => {
    const targetScore = window.game.computeScore()

    if (targetScore > CURRENT_SCORE) {
      componentRoot.classList.add('score-added')

      setTimeout(() => {
        componentRoot.classList.remove('score-added')
      }, 3000)
    }

    componentRoot.innerHTML = window.game.computeScore()

    CURRENT_SCORE = targetScore
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
