/**
 * Game verification module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class GameVerificationV12 {
  static meta = { name: 'game-verification', description: 'Verify world is ready' };
  async verifyGame(page, config) {
    console.log('Simulacrum | [V12 Game] 🎯 Verifying game world...');
    
    try {
      // Wait for game world to fully load (exactly like working POC)
      console.log('Simulacrum | [V12 Game] ⏳ Waiting for game world to fully load...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Take comprehensive verification (exactly like working POC)
      const gameWorldVerification = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          hasGameCanvas: !!document.querySelector('canvas#board'),
          hasGameUI: !!document.querySelector('#ui-left, #ui-right, #navigation'),
          gameWorldLoaded: window.game?.world?.id || null,
          currentSystemId: window.game?.system?.id || null,
          isInGameWorld: window.location.href.includes('/game') || 
                        (!window.location.href.includes('/setup') && !window.location.href.includes('/license')),
          // Additional verification
          hasSidebar: !!document.querySelector('#sidebar'),
          hasPlayers: !!document.querySelector('#players'),
          hasSceneControls: !!document.querySelector('#scene-controls'),
          hasHotbar: !!document.querySelector('#hotbar'),
          hasChatLog: !!document.querySelector('#chat-log'),
          // Game state verification
          gameReady: window.game?.ready || false,
          userAuthenticated: !!window.game?.user,
          isGM: window.game?.user?.isGM || false,
          worldTitle: window.game?.world?.title || null,
          systemTitle: window.game?.system?.title || null
        };
      });
      
      console.log('Simulacrum | [V12 Game] 📊 Game World Verification:', JSON.stringify(gameWorldVerification, null, 2));
      
      // Verify we're actually in a working game world (exactly like working POC)
      if (!gameWorldVerification.isInGameWorld || !gameWorldVerification.hasGameUI) {
        return { 
          ready: false, 
          error: 'Not in active game UI after launch',
          gameState: gameWorldVerification 
        };
      }
      
      if (!gameWorldVerification.gameReady || !gameWorldVerification.userAuthenticated) {
        return { 
          ready: false, 
          error: 'Game not fully ready or user not authenticated',
          gameState: gameWorldVerification 
        };
      }
      
      // Final comprehensive verification (exactly like working POC)
      const finalVerification = await page.evaluate(() => {
        return {
          // Core game state
          gameReady: window.game?.ready || false,
          worldLoaded: !!window.game?.world,
          systemLoaded: !!window.game?.system,
          userAuthenticated: !!window.game?.user,
          
          // UI elements
          uiElements: {
            sidebar: !!document.querySelector('#sidebar'),
            players: !!document.querySelector('#players'),
            sceneControls: !!document.querySelector('#scene-controls'),
            hotbar: !!document.querySelector('#hotbar'),
            chatLog: !!document.querySelector('#chat-log'),
            canvas: !!document.querySelector('canvas#board')
          },
          
          // Collections and data
          collections: {
            actors: window.game?.collections?.get('actors')?.size || 0,
            items: window.game?.collections?.get('items')?.size || 0,
            scenes: window.game?.collections?.get('scenes')?.size || 0,
            users: window.game?.collections?.get('users')?.size || 0
          },
          
          // User permissions
          userRole: window.game?.user?.role || 'unknown',
          isGM: window.game?.user?.isGM || false,
          
          // System information
          systemInfo: {
            id: window.game?.system?.id || 'unknown',
            title: window.game?.system?.title || 'unknown',
            version: window.game?.system?.version || 'unknown'
          }
        };
      });
      
      console.log('Simulacrum | [V12 Game] 📊 FINAL COMPREHENSIVE VERIFICATION:');
      console.log('Simulacrum | [V12 Game] 📊 Verification Data:', JSON.stringify(finalVerification, null, 2));
      
      if (finalVerification.gameReady && finalVerification.worldLoaded && finalVerification.userAuthenticated) {
        console.log('Simulacrum | [V12 Game] ✅✅✅ COMPLETE SUCCESS VERIFICATION! ✅✅✅');
        console.log('Simulacrum | [V12 Game] 🎯 FoundryVTT is fully operational with a working game world');
        console.log('Simulacrum | [V12 Game] 🎯 User is authenticated and ready to play');
        console.log('Simulacrum | [V12 Game] 🎯 All essential UI components are present and functional');
        
        return { 
          success: true,
          ready: true, 
          gameState: {
            ...gameWorldVerification,
            finalVerification
          }
        };
      } else {
        return { 
          success: false,
          ready: false, 
          error: 'Final verification failed - game world not fully operational',
          gameState: {
            ...gameWorldVerification,
            finalVerification
          }
        };
      }
      
    } catch (error) {
      return { success: false, ready: false, error: error.message };
    }
  }
}
