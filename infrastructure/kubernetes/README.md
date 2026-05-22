# Kubernetes 清单（示例）

## 布局

- `namespace.yaml` — `Namespace/zhixue`
- `configmap-env.sample.yaml` — 网关上游 URL（**统一入口**：含 `WEB_UPSTREAM_URL`）
- `service-*.yaml` — ClusterIP
- `deployment-*.yaml` — 占位镜像 `zhixue/*`（需自行 build push 或改为本地镜像加载）
- `ingress-gateway.sample.yaml` — 全站指向网关（8090）
- `ingress-split.sample.yaml` — `/api` → 网关，`/` → Web（此时请将网关 `WEB_UPSTREAM_URL` **留空**）

## 推荐 apply 顺序

```bash
kubectl apply -f infrastructure/kubernetes/namespace.yaml
kubectl apply -f infrastructure/kubernetes/configmap-env.sample.yaml
kubectl apply -f infrastructure/kubernetes/service-ocr.yaml
kubectl apply -f infrastructure/kubernetes/service-formula.yaml
kubectl apply -f infrastructure/kubernetes/service-vision.yaml
kubectl apply -f infrastructure/kubernetes/service-agent.yaml
kubectl apply -f infrastructure/kubernetes/service-web.yaml
kubectl apply -f infrastructure/kubernetes/service-question-parser.yaml
kubectl apply -f infrastructure/kubernetes/service-gateway.yaml
kubectl apply -f infrastructure/kubernetes/deployment-ocr.yaml
kubectl apply -f infrastructure/kubernetes/deployment-formula.yaml
kubectl apply -f infrastructure/kubernetes/deployment-vision.yaml
kubectl apply -f infrastructure/kubernetes/deployment-agent.yaml
kubectl apply -f infrastructure/kubernetes/deployment-web.yaml
kubectl apply -f infrastructure/kubernetes/deployment-question-parser.yaml
kubectl apply -f infrastructure/kubernetes/deployment-gateway.yaml
# 任选其一 Ingress：
# kubectl apply -f infrastructure/kubernetes/ingress-gateway.sample.yaml
```

镜像需与 Dockerfile 构建一致；生产环境请替换 `zhixue/*:latest`、拆 Secret、加资源限制与 HPA。

## 分拆 Ingress 时的 ConfigMap

将 `WEB_UPSTREAM_URL` 设为空字符串，避免网关与 Ingress 双重反代 Web。
