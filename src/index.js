import {EventEmitter} from 'events'

import {componentSystem, trigger} from '@orioro/web-ui-core'

import gameActivity from './scripts/game-activity'
import gameScore from './scripts/game-score'


const arrayAddUnique = (arr, item) => {
  return arr.indexOf(item) === -1 ? [...arr, item] : arr
}

class Game extends EventEmitter {
  constructor() {
    super()
    this.loadFromLocalStorage()

    this.emit('game-updated')
  }

  resetGame() {
    this.unlockedActivities = []
    this.saveToLocalStorage()

    this.emit('game-updated')
  }

  unlockActivity(activityId) {
    this.unlockedActivities = arrayAddUnique(this.unlockedActivities, activityId)
    this.activeActivity = activityId
    this.saveToLocalStorage()

    this.emit('game-updated')
  }

  saveToLocalStorage() {
    window.localStorage.setItem('gameData', JSON.stringify({
      unlockedActivities: this.unlockedActivities
    }))
  }

  computeScore() {
    var score = 0
    this.unlockedActivities.forEach(activityId => {
      const activityElement = document.getElementById(activityId)
      const activityScore = parseInt(activityElement.getAttribute('data-game-activity-points'))

      score = score + activityScore
    })

    return score
  }

  isActivityUnlocked(activityId) {
    return this.unlockedActivities.indexOf(activityId) !== -1
  }

  loadFromLocalStorage() {
    const gameDataStr = window.localStorage.getItem('gameData')
    const storedData = gameDataStr ? JSON.parse(gameDataStr) : null
    this.unlockedActivities = storedData ? storedData.unlockedActivities : []
  }
}

window.game = new Game()

document.addEventListener('DOMContentLoaded', () => {
  const system = componentSystem('component', [
    trigger(),
    gameActivity(),
    gameScore(),

    {
      componentName: 'game',
      createInstance: () => {
        return {
          defaultAction: () => {},
          resetGame: () => {
            window.game.resetGame()
          }
        }
      }
    }
  ])

  system.initialize()
})
