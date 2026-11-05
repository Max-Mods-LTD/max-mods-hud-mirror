// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
import android.content.Context;
import android.net.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
final class QrConnector{
 private static long number(InetAddress ip){byte[] b=ip.getAddress();return (b[0]&255L)<<24|(b[1]&255L)<<16|(b[2]&255L)<<8|b[3]&255L;}
 static String connect(Context context,String scanned)throws Exception{
  Uri uri=Uri.parse(scanned);String version=uri.getQueryParameter("v");
  if(!"maxmods".equals(uri.getScheme())||!"pair".equals(uri.getHost())||!("1".equals(version)||"2".equals(version)))throw new IOException("This is not a Max Mods pairing QR");
  String key=uri.getQueryParameter("key"),hosts=uri.getQueryParameter("hosts"),port=uri.getQueryParameter("port");if(hosts==null)hosts=uri.getQueryParameter("host");
  if(hosts==null||key==null||!key.matches("[a-f0-9]{48}")||!"8477".equals(port)||hosts.split(",").length>4)throw new IOException("Invalid car QR");
  final String pairing=CaptureService.pairingText;if(!CaptureService.active||!pairing.matches("[0-9.]+/[0-9]{8}"))throw new IOException("Start sharing before scanning");
  ConnectivityManager cm=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);Network wifi=null;LinkProperties links=null;
  for(Network n:cm.getAllNetworks()){NetworkCapabilities c=cm.getNetworkCapabilities(n);LinkProperties l=cm.getLinkProperties(n);if(c==null||l==null||!c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))continue;
   for(LinkAddress a:l.getLinkAddresses())if(pairing.startsWith(a.getAddress().getHostAddress()+"/")){wifi=n;links=l;}}
  if(wifi==null)throw new IOException("Phone Wi-Fi changed. Connect to BMW Wi-Fi and restart sharing");
  List<String> local=new ArrayList<>();
  for(String host:hosts.split(",")){
   if(!host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))throw new IOException("Invalid car address");InetAddress address=InetAddress.getByName(host);
   if(!(address instanceof Inet4Address)||!address.isSiteLocalAddress())throw new IOException("Car QR must use private Wi-Fi addresses");
   for(LinkAddress a:links.getLinkAddresses())if(a.getAddress() instanceof Inet4Address){long mask=a.getPrefixLength()==0?0:(0xffffffffL<<(32-a.getPrefixLength()))&0xffffffffL;if((number(address)&mask)==(number(a.getAddress())&mask)){local.add(host);break;}}
  }
  if(local.isEmpty())throw new IOException("The QR is on a different car network. Use the same BMW Wi-Fi, not a guest network");
  String last="No route to the car";
  for(String host:local){HttpURLConnection conn=null;try{
   conn=(HttpURLConnection)wifi.openConnection(new URL("http://"+host+":8477/pair"));conn.setConnectTimeout(1800);conn.setReadTimeout(8500);conn.setInstanceFollowRedirects(false);conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setFixedLengthStreamingMode(8);conn.setRequestProperty("Content-Type","text/plain");conn.setRequestProperty("X-MaxMods-Pair",key);
   try(OutputStream out=conn.getOutputStream()){out.write(pairing.substring(pairing.lastIndexOf('/')+1).getBytes(StandardCharsets.US_ASCII));}
   int status=conn.getResponseCode();if(status==200)return "Paired. The selected car display starts automatically.";
   InputStream in=conn.getErrorStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream();if(in!=null)try{for(int ch;bytes.size()<400&&(ch=in.read())!=-1;)bytes.write(ch);}finally{in.close();}
   last=status==403?"QR expired or car is not in Park. Show a fresh QR.":bytes.size()>0?bytes.toString("UTF-8"):"Car refused pairing ("+status+")";
  }catch(IOException e){last=e.getMessage()==null?"Car connection timed out":e.getMessage();}finally{if(conn!=null)conn.disconnect();}}
  throw new IOException(last+". Check Max Mods Connect 0.2.0 in the car Store.");
 }
}
