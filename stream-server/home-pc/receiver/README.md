# ADS-B receiver on the home PC

A USB ADS-B stick (RTL2832U with an R820T tuner, USB id `0bda:2838`) and an
antenna on the streaming PC. `readsb` decodes 1090 MHz and writes JSON to
`/run/fids-receiver/`. That is all it does so far.

* **Nothing leaves the PC.** The unit has no network at all
  (`PrivateNetwork=yes`): no port, no web server, no feed to any network.
* **The position of the antenna is stored nowhere.** readsb gets no latitude or
  longitude. Airborne positions decode from message pairs without one; surface
  positions decode only for an aircraft already heard in the air.
* **The streams come first.** Low CPU and disk weight, 512 MB at most, a
  throwaway user, one device.
* **No power on the antenna socket.** The bias-tee code is not compiled in.

## Install

```
sudo bash install.sh
```

It installs Ubuntu packages (`rtl-sdr`, a C compiler and four development
packages), keeps Ubuntu from using the stick as a TV tuner
(`/etc/modprobe.d/adsb-stick.conf`), builds readsb 3.16.21 from one pinned
commit and starts `fids-receiver`. `sudo bash install.sh --remove` undoes it
apart from the Ubuntu packages.

Plug the stick into the PC itself, not into a KVM: a KVM takes the stick away
when it switches. A passive USB extension should stay under about 3 m.

## Files

| Path on the PC | From |
|---|---|
| `/opt/fids-receiver/bin/readsb` | built by `bin/receiver-build` |
| `/opt/fids-receiver/bin/receiver-build`, `fids-planes` | `bin/` |
| `/etc/systemd/system/fids-receiver.service` | `systemd/` |
| `/etc/modprobe.d/adsb-stick.conf` | `config/` |
| `/run/fids-receiver/` | `aircraft.json` every second, `stats.json` every 10 seconds |
| `/usr/local/bin/fids-planes` | symlink |

## Day to day

| | |
|---|---|
| What it hears now, and the last 15 minutes | `fids-planes` |
| Its messages | `journalctl -u fids-receiver` |
| Is it running | `systemctl status fids-receiver` |

With the stick unplugged the unit ends and tries again every 30 seconds.

## A new readsb version

Change `VERSION`, `COMMIT` and `SHA256` in `bin/receiver-build` together: the
commit is the one the release tag points to, and the SHA-256 is that of the
archive at that commit, after its content was compared with a git checkout.
Then run `sudo /opt/fids-receiver/bin/receiver-build` and
`sudo systemctl restart fids-receiver`. A build that fails, or a program that
does not say the pinned version, leaves the running one in place.

## Not done here

Sending positions to the boards, feeding any network, and a map. The licence
terms of each network and the rules for paid screens are settled first.
