import { useMemo, useEffect } from 'react';
import useOrbitCamera, { type Point3 } from '../../hooks/useOrbitCamera';
import { anchorOfNode, type HoverAnchor } from '../common';
import { useI18n } from '../../i18n';
import type { WifiDevice } from '@shared/types/m1';
import { deviceLabel } from '@shared/utils/device-label';

const VIEW_W = 1200;
const VIEW_H = 820;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;
const CAMERA_DISTANCE = 1500;

const LAN_RADIUS = 230;
const IOT_RADIUS = 420;
const RING_TILT = 120;
const HUB_RADIUS = 22;
const NODE_RADIUS = 13;

const RING_SEGMENTS = 72;

interface DeviceOrbitProps {
    devices: WifiDevice[];
    selectedMac: string | null;
    isNew: (device: WifiDevice) => boolean;
    onSelect: (mac: string | null) => void;
    onHover: (anchor: HoverAnchor | null) => void;
    hoveredMac: string | null;
}

/**
 * Two coaxial rings: everyday devices close in, IoT further out. Each ring is
 * tilted along y so a full orbit separates neighbours that would otherwise
 * overlap when viewed edge-on.
 */
function layoutRings(devices: WifiDevice[]): Map<string, Point3> {
    const positions = new Map<string, Point3>();

    for (const isIot of [false, true]) {
        const group = devices.filter((d) => d.isIot === isIot);
        const radius = isIot ? IOT_RADIUS : LAN_RADIUS;
        const phase = isIot ? Math.PI / 6 : 0;

        group.forEach((device, index) => {
            const t = index / Math.max(group.length, 1);
            const angle = t * Math.PI * 2 + phase;
            positions.set(device.mac, {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle * 2) * (RING_TILT / 2),
                z: Math.sin(angle) * radius,
            });
        });
    }

    return positions;
}

function ringPath(radius: number, phase: number, project: (p: Point3) => { sx: number; sy: number }): string {
    const points: string[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i += 1) {
        const angle = (i / RING_SEGMENTS) * Math.PI * 2 + phase;
        const { sx, sy } = project({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle * 2) * (RING_TILT / 2),
            z: Math.sin(angle) * radius,
        });
        points.push(`${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    return points.join(' ');
}

function DeviceOrbit({ devices, selectedMac, isNew, onSelect, onHover, hoveredMac }: DeviceOrbitProps) {
    const { t } = useI18n();
    const focused = selectedMac ?? hoveredMac;

    const { project, handlers } = useOrbitCamera({
        centerX: CENTER_X,
        centerY: CENTER_Y,
        distance: CAMERA_DISTANCE,
        paused: focused !== null,
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onSelect(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onSelect]);

    const rings = useMemo(() => layoutRings(devices), [devices]);

    const hub = project({ x: 0, y: 0, z: 0 });

    const placed = useMemo(
        () =>
            devices
                .map((device) => {
                    const point = rings.get(device.mac);
                    return point ? { device, projected: project(point) } : null;
                })
                .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
                // Painter's algorithm: far nodes first so near ones overlap them.
                .sort((a, b) => b.projected.z - a.projected.z),
        [devices, rings, project],
    );

    return (
        <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="device-orbit__svg"
            preserveAspectRatio="xMidYMid meet"
            aria-label={t('devices.orbit.aria')}
            {...handlers}
            onClick={(event) => {
                if (event.target === event.currentTarget) onSelect(null);
            }}
        >
            <path className="device-orbit__ring" d={ringPath(LAN_RADIUS, 0, project)} />
            <path className="device-orbit__ring" d={ringPath(IOT_RADIUS, Math.PI / 6, project)} />

            <g>
                {placed.map(({ device, projected }) => (
                    <line
                        key={`spoke-${device.mac}`}
                        x1={hub.sx}
                        y1={hub.sy}
                        x2={projected.sx}
                        y2={projected.sy}
                        className={`device-orbit__spoke ${focused && focused !== device.mac ? 'device-orbit__spoke--dim' : ''}`}
                        strokeWidth={projected.scale}
                    />
                ))}
            </g>

            <g className="device-orbit__hub" aria-label={t('devices.orbit.hubAria')}>
                <circle cx={hub.sx} cy={hub.sy} r={HUB_RADIUS * hub.scale} />
                <text x={hub.sx} y={hub.sy + HUB_RADIUS * hub.scale + 18} textAnchor="middle">
                    {t('devices.orbit.hub')}
                </text>
            </g>

            <g>
                {placed.map(({ device, projected }) => {
                    const name = deviceLabel(device);
                    const isDim = focused !== null && focused !== device.mac;
                    const r = NODE_RADIUS * projected.scale;
                    return (
                        <g
                            key={device.mac}
                            className={[
                                'device-orbit__node',
                                device.isIot ? 'device-orbit__node--iot' : 'device-orbit__node--lan',
                                isNew(device) ? 'device-orbit__node--new' : '',
                                isDim ? 'device-orbit__node--dim' : '',
                                selectedMac === device.mac ? 'device-orbit__node--selected' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            onPointerEnter={(event) =>
                                onHover({ id: device.mac, x: event.clientX, y: event.clientY })
                            }
                            onPointerMove={(event) => {
                                // While a drag is orbiting the scene, the tooltip must not chase
                                // the cursor across the canvas.
                                if (event.buttons !== 0) return;
                                onHover({ id: device.mac, x: event.clientX, y: event.clientY });
                            }}
                            onPointerLeave={() => onHover(null)}
                            onFocus={(event) => onHover(anchorOfNode(event.currentTarget, device.mac))}
                            onBlur={() => onHover(null)}
                            onClick={() => onSelect(selectedMac === device.mac ? null : device.mac)}
                            tabIndex={0}
                            role="button"
                            aria-label={`${name}${device.isIot ? ` (${t('devices.type.iot')})` : ''} — ${device.ip}`}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onSelect(selectedMac === device.mac ? null : device.mac);
                                }
                            }}
                        >
                            <circle
                                cx={projected.sx}
                                cy={projected.sy}
                                r={r}
                                style={{ opacity: 0.5 + projected.scale * 0.5 }}
                            />
                            <text x={projected.sx} y={projected.sy - r - 7} textAnchor="middle">
                                {name}
                            </text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}

export default DeviceOrbit;
