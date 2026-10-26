package com.firemint.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.firemint.account.AccountPackage
import com.firemint.auth_users.AuthUsersPackage
import com.firemint.connection.GoogleAuthPackage
import com.firemint.data_transfer.TransferPackage
import com.firemint.explorer.ExplorerPackage
import com.firemint.query.QueryPackage
import com.firemint.settings.SettingsPackage
import com.firemint.shared.BridgePingPackage
import com.firemint.snippet.SnippetPackage
import com.firemint.workspace.WorkspacePackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(BridgePingPackage())
          add(AccountPackage())
          add(GoogleAuthPackage())
          add(WorkspacePackage())
          add(ExplorerPackage())
          add(QueryPackage())
          add(SnippetPackage())
          add(SettingsPackage())
          add(TransferPackage())
          add(AuthUsersPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
