package com.homerours.musiccontrols;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import android.app.Notification;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import android.media.session.MediaSession.Token;

import android.util.Log;
import android.app.Activity;
import android.content.Context;
import android.content.IntentFilter;
import android.content.Intent;
import android.app.PendingIntent;
import android.content.ServiceConnection;
import android.content.ComponentName;
import android.app.Service;
import android.os.IBinder;
import android.os.Bundle;
import android.os.Build;
import android.R;
import android.content.BroadcastReceiver;
import android.media.AudioManager;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MusicControls extends CordovaPlugin {
	private MusicControlsBroadcastReceiver mMessageReceiver;
	private MusicControlsNotification notification;
	private MediaSessionCompat mediaSessionCompat;
	private final int notificationID=7824;
	private AudioManager mAudioManager;
	private PendingIntent mediaButtonPendingIntent;
	private boolean mediaButtonAccess=true;
	private android.media.session.MediaSession.Token token;

  	private Activity cordovaActivity;

	private MediaSessionCallback mMediaSessionCallback = new MediaSessionCallback();

	private void registerBroadcaster(MusicControlsBroadcastReceiver mMessageReceiver){
		final Context context = this.cordova.getActivity().getApplicationContext();
		// Android 13+ (API 33+) requires RECEIVER_EXPORTED/RECEIVER_NOT_EXPORTED on every
		// context.registerReceiver() call, or it throws a SecurityException — and since this
		// ran unconditionally in initialize() (every plugin's Cordova lifecycle hook, called on
		// every app launch regardless of whether Quran audio is even playing), the missing flag
		// crashed the whole app on startup on any Android 13+ device, not just during playback.
		// androidx.core.content.ContextCompat.registerReceiver() picks the right call for the
		// running API level instead of needing a manual SDK_INT branch here.
		androidx.core.content.ContextCompat.registerReceiver(context, (BroadcastReceiver)mMessageReceiver, new IntentFilter("music-controls-previous"), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);
		androidx.core.content.ContextCompat.registerReceiver(context, (BroadcastReceiver)mMessageReceiver, new IntentFilter("music-controls-pause"), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);
		androidx.core.content.ContextCompat.registerReceiver(context, (BroadcastReceiver)mMessageReceiver, new IntentFilter("music-controls-play"), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);
		androidx.core.content.ContextCompat.registerReceiver(context, (BroadcastReceiver)mMessageReceiver, new IntentFilter("music-controls-next"), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);
		androidx.core.content.ContextCompat.registerReceiver(context, (BroadcastReceiver)mMessageReceiver, new IntentFilter("music-controls-media-button"), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);
		androidx.core.content.ContextCompat.registerReceiver(context, (BroadcastReceiver)mMessageReceiver, new IntentFilter("music-controls-destroy"), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);

		// Listen for headset plug/unplug — a real system broadcast, so it needs EXPORTED.
		androidx.core.content.ContextCompat.registerReceiver(context, (BroadcastReceiver)mMessageReceiver, new IntentFilter(Intent.ACTION_HEADSET_PLUG), androidx.core.content.ContextCompat.RECEIVER_EXPORTED);

		// Listen for bluetooth connection state changes — also a system broadcast.
		androidx.core.content.ContextCompat.registerReceiver(context, (BroadcastReceiver)mMessageReceiver, new IntentFilter(android.bluetooth.BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED), androidx.core.content.ContextCompat.RECEIVER_EXPORTED);
	}

	// Register pendingIntent for broacast
	public void registerMediaButtonEvent(){

		this.mediaSessionCompat.setMediaButtonReceiver(this.mediaButtonPendingIntent);

		/*if (this.mediaButtonAccess && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR2){
		this.mAudioManager.registerMediaButtonEventReceiver(this.mediaButtonPendingIntent);
		}*/
	}

	public void unregisterMediaButtonEvent(){
		this.mediaSessionCompat.setMediaButtonReceiver(null);
		/*if (this.mediaButtonAccess && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR2){
		this.mAudioManager.unregisterMediaButtonEventReceiver(this.mediaButtonPendingIntent);
		}*/
	}

	public void destroyPlayerNotification(){
		this.notification.destroy();
	}

	@Override
	public void initialize(CordovaInterface cordova, CordovaWebView webView) {
		super.initialize(cordova, webView);
		final Activity activity = this.cordova.getActivity();
		final Context context=activity.getApplicationContext();

		// Notification Killer
		final MusicControlsServiceConnection mConnection = new MusicControlsServiceConnection(activity);

		this.cordovaActivity = activity;
/* 		this.notification = new MusicControlsNotification(this.cordovaActivity, this.notificationID) {
			@Override
			protected void onNotificationUpdated(Notification notification) {
				mConnection.setNotification(notification, this.infos.isPlaying);
			}

			@Override
			protected void onNotificationDestroyed() {
				mConnection.setNotification(null, false);
			}
		}; */

		this.mMessageReceiver = new MusicControlsBroadcastReceiver(this);
		this.registerBroadcaster(mMessageReceiver);

		
		this.mediaSessionCompat = new MediaSessionCompat(context, "cordova-music-controls-media-session", null, this.mediaButtonPendingIntent);
		this.mediaSessionCompat.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);

		MediaSessionCompat.Token _token = this.mediaSessionCompat.getSessionToken();
		this.token = (android.media.session.MediaSession.Token) _token.getToken();

		setMediaPlaybackState(PlaybackStateCompat.STATE_PAUSED);
		this.mediaSessionCompat.setActive(true);

		this.mediaSessionCompat.setCallback(this.mMediaSessionCallback);

		this.notification = new MusicControlsNotification(this.cordovaActivity, this.notificationID, this.token) {
			@Override
			protected void onNotificationUpdated(Notification notification) {
				mConnection.setNotification(notification, this.infos.isPlaying);
			}

			@Override
			protected void onNotificationDestroyed() {
				mConnection.setNotification(null, false);
			}
		};
		
		// Register media (headset) button event receiver
		try {
			this.mAudioManager = (AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
			Intent headsetIntent = new Intent("music-controls-media-button");
			this.mediaButtonPendingIntent = PendingIntent.getBroadcast(
				context, 0, headsetIntent,
				// Android 14+ (API 34) disallows FLAG_MUTABLE on a PendingIntent for an
				// implicit Intent (no explicit component) — this is an implicit intent
				// (action string only) that this app's own receiver picks up, so it never
				// needs the system to mutate it; FLAG_IMMUTABLE is the correct/safe choice.
				Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT
			);
			this.registerMediaButtonEvent();
		} catch (Exception e) {
			this.mediaButtonAccess=false;
			e.printStackTrace();
		}

		Intent startServiceIntent = new Intent(activity,MusicControlsNotificationKiller.class);
		startServiceIntent.putExtra("notificationID",this.notificationID);
		activity.bindService(startServiceIntent, mConnection, Context.BIND_AUTO_CREATE);
	}

	@Override
	public boolean execute(final String action, final JSONArray args, final CallbackContext callbackContext) throws JSONException {
		final Context context=this.cordova.getActivity().getApplicationContext();
		final Activity activity=this.cordova.getActivity();

		
		// Every action body below is wrapped in try/catch(Throwable): this plugin's
		// native notification/foreground-service/media-session code has never been
		// exercised on real Android 13+/14 devices in this app (a separate startup
		// crash blocked all use of it until recently), so any latent issue here
		// (missing permission, OEM quirk, API-level edge case, etc.) must not be
		// allowed to crash the whole app — it should just fail to show/update the
		// lock-screen widget instead. audio playback itself never routes through
		// this plugin, so it's unaffected either way.
		if (action.equals("create")) {
			final MusicControlsInfos infos;
			try {
				infos = new MusicControlsInfos(args);
			} catch (Throwable t) {
				t.printStackTrace();
				callbackContext.error("music-controls create failed: " + t);
				return true;
			}
			final MediaMetadataCompat.Builder metadataBuilder = new MediaMetadataCompat.Builder();

			this.cordova.getThreadPool().execute(new Runnable() {
				public void run() {
					try {
						notification.updateNotification(infos);

						// track title
						metadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_TITLE, infos.track);
						// artists
						metadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_ARTIST, infos.artist);
						//album
						metadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM, infos.album);

						Bitmap art = getBitmapCover(infos.cover);
						if(art != null){
							metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art);
							metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, art);

						}

						mediaSessionCompat.setMetadata(metadataBuilder.build());

						if(infos.isPlaying)
							setMediaPlaybackState(PlaybackStateCompat.STATE_PLAYING);
						else
							setMediaPlaybackState(PlaybackStateCompat.STATE_PAUSED);

						callbackContext.success("success");
					} catch (Throwable t) {
						t.printStackTrace();
						callbackContext.error("music-controls create failed: " + t);
					}
				}
			});
		}
		else if (action.equals("updateIsPlaying")){
			try {
				final JSONObject params = args.getJSONObject(0);
				final boolean isPlaying = params.getBoolean("isPlaying");
				this.notification.updateIsPlaying(isPlaying);

				if(isPlaying)
					setMediaPlaybackState(PlaybackStateCompat.STATE_PLAYING);
				else
					setMediaPlaybackState(PlaybackStateCompat.STATE_PAUSED);

				callbackContext.success("success");
			} catch (Throwable t) {
				t.printStackTrace();
				callbackContext.error("music-controls updateIsPlaying failed: " + t);
			}
		}
		else if (action.equals("updateDismissable")){
			try {
				final JSONObject params = args.getJSONObject(0);
				final boolean dismissable = params.getBoolean("dismissable");
				this.notification.updateDismissable(dismissable);
				callbackContext.success("success");
			} catch (Throwable t) {
				t.printStackTrace();
				callbackContext.error("music-controls updateDismissable failed: " + t);
			}
		}
		else if (action.equals("destroy")){
			try {
				this.notification.destroy();
				this.mMessageReceiver.stopListening();
				callbackContext.success("success");
			} catch (Throwable t) {
				t.printStackTrace();
				callbackContext.error("music-controls destroy failed: " + t);
			}
		}
		else if (action.equals("watch")) {
			try {
				this.registerMediaButtonEvent();
			} catch (Throwable t) {
				t.printStackTrace();
			}
      			this.cordova.getThreadPool().execute(new Runnable() {
				public void run() {
					try {
						mMediaSessionCallback.setCallback(callbackContext);
						mMessageReceiver.setCallback(callbackContext);
					} catch (Throwable t) {
						t.printStackTrace();
					}
				}
			});
		}
		return true;
	}

	@Override
	public void onDestroy() {
		this.notification.destroy();
		this.mMessageReceiver.stopListening();
		this.unregisterMediaButtonEvent();
		super.onDestroy();
	}

	@Override
	public void onReset() {
		onDestroy();
		super.onReset();
	}
	private void setMediaPlaybackState(int state) {
		PlaybackStateCompat.Builder playbackstateBuilder = new PlaybackStateCompat.Builder();
		if( state == PlaybackStateCompat.STATE_PLAYING ) {
			playbackstateBuilder.setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
				PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID |
				PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH);
			playbackstateBuilder.setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f);
		} else {
			playbackstateBuilder.setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
				PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID |
				PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH);
			playbackstateBuilder.setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 0);
		}
		this.mediaSessionCompat.setPlaybackState(playbackstateBuilder.build());
	}
	
	// Get image from url
	private Bitmap getBitmapCover(String coverURL){
		try{
			if(coverURL.matches("^(https?|ftp)://.*$"))
				// Remote image
				return getBitmapFromURL(coverURL);
			else {
				// Local image
				return getBitmapFromLocal(coverURL);
			}
		} catch (Exception ex) {
			ex.printStackTrace();
			return null;
		}
	}

	// get Local image
	private Bitmap getBitmapFromLocal(String localURL){
		try {
			Uri uri = Uri.parse(localURL);
			File file = new File(uri.getPath());
			FileInputStream fileStream = new FileInputStream(file);
			BufferedInputStream buf = new BufferedInputStream(fileStream);
			Bitmap myBitmap = BitmapFactory.decodeStream(buf);
			buf.close();
			return myBitmap;
		} catch (Exception ex) {
			try {
				InputStream fileStream = cordovaActivity.getAssets().open("www/" + localURL);
				BufferedInputStream buf = new BufferedInputStream(fileStream);
				Bitmap myBitmap = BitmapFactory.decodeStream(buf);
				buf.close();
				return myBitmap;
			} catch (Exception ex2) {
				ex.printStackTrace();
				ex2.printStackTrace();
				return null;
			}
		}
	}

	// get Remote image
	private Bitmap getBitmapFromURL(String strURL) {
		try {
			URL url = new URL(strURL);
			HttpURLConnection connection = (HttpURLConnection) url.openConnection();
			connection.setDoInput(true);
			connection.connect();
			InputStream input = connection.getInputStream();
			Bitmap myBitmap = BitmapFactory.decodeStream(input);
			return myBitmap;
		} catch (Exception ex) {
			ex.printStackTrace();
			return null;
		}
	}
}
