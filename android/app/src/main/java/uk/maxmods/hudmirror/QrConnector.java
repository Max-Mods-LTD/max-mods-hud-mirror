// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
import android.content.Context;
import android.net.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

final class QrConnector {
    static String connect(Context context,String scanned) throws Exception {
        Uri uri=Uri.parse(scanned);
        if(!"maxmods".equals(uri.getScheme())||!"pair".equals(uri.getHost())||!"1".equals(uri.getQueryParameter("v")))throw new IOException("This is not a Max Mods pairing QR");
        String host=uri.getQueryParameter("host"),key=uri.getQueryParameter("key"),port=uri.getQueryParameter("port");
        if(host==null||!host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")||key==null||!key.matches("[a-f0-9]{48}")||!"8477".equals(port))throw new IOException("Invalid car QR");
        InetAddress ip=InetAddress.getByName(host);
        if(!(ip instanceof Inet4Address)||!ip.isSiteLocalAddress())throw new IOException("Car QR must use a local Wi-Fi address");
        String pairing=CaptureService.pairingText;
        if(!CaptureService.active||!pairing.matches("[0-9.]+/[0-9]{8}"))throw new IOException("Start sharing before scanning the car QR");
        ConnectivityManager cm=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        Network wifi=null;
        for(Network n:cm.getAllNetworks()){
            NetworkCapabilities c=cm.getNetworkCapabilities(n);
            if(c!=null&&c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)){
                LinkProperties l=cm.getLinkProperties(n);
                if(l!=null)for(LinkAddress a:l.getLinkAddresses())if(pairing.startsWith(a.getAddress().getHostAddress()+"/"))wifi=n;
            }
        }
        if(wifi==null)throw new IOException("Connect to the same BMW Wi-Fi as the car");
        HttpURLConnection conn=(HttpURLConnection)wifi.openConnection(new URL("http://"+host+":8477/pair"));
        try{
            conn.setConnectTimeout(3500);conn.setReadTimeout(6000);conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setFixedLengthStreamingMode(8);
            conn.setRequestProperty("Content-Type","text/plain");conn.setRequestProperty("X-MaxMods-Pair",key);
            conn.getOutputStream().write(pairing.substring(pairing.lastIndexOf('/')+1).getBytes(StandardCharsets.US_ASCII));
            int status=conn.getResponseCode();
            if(status!=200)throw new IOException(status==403?"QR expired. Open a new code in the car.":"Pairing failed. Open a new QR and try again.");
            return "Phone paired. Select Start mirror in the car.";
        }finally{conn.disconnect();}
    }
}
