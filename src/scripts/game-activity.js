import {PropTypes} from '@orioro/web-ui-core'

const COMPONENT_NAME = 'game-activity'

const ACTIVITY_CARD_SELECTOR = '.activity__card'

const createInstance = (system, componentRoot, {
  points
}) => {
  const activityId = componentRoot.getAttribute('id')
  const card = componentRoot.querySelector(ACTIVITY_CARD_SELECTOR)

  const unlock = () => {
    window.game.unlockActivity(activityId)

    // componentRoot.classList.add('activity--details-open')
    // componentRoot.classList.add('activity--details-unlocked')
  }

  const open = () => {
    componentRoot.classList.add('activity--details-open')
  }

  const close = () => {
    componentRoot.classList.remove('activity--details-open')
  }

  const updateActivityStatus = () => {
    if (window.game.isActivityUnlocked(activityId)) {
      componentRoot.classList.add('activity--details-unlocked')
    } else {
      componentRoot.classList.remove('activity--details-unlocked')
    }

    if (window.game.activeActivity === activityId) {
      open()
    } else {
      window.game.activeActivity = null
      close()
    }
  }

  updateActivityStatus()
  window.game.on('game-updated', updateActivityStatus)

  return {
    defaultAction: () => {
      unlock()
    },
    unlock,
    open,
    close
  }
}

export default () => {
  return {
    componentName: COMPONENT_NAME,
    createInstance,
    instancePropTypes: {
      points: PropTypes.number.isRequired,
    },
  }
}
