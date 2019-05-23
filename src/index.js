import {componentSystem, trigger} from '@orioro/web-ui-core'

import gameActivity from './scripts/game-activity'
import gameScore from './scripts/game-score'
import Game from './game'


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
          goToHome: () => {
            window.game.goToHome()
          },
          resetGame: () => {
            window.game.resetGame()
          }
        }
      }
    }
  ])

  system.initialize()
})
